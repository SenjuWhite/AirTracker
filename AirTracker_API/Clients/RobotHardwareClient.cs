using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

public class RobotHardwareClient : IAsyncDisposable
{
    private readonly ConcurrentDictionary<int, ControlConnection> _connections = new();
    private readonly ConcurrentDictionary<int, VideoChannel> _videoChannels = new();

    public event Action<int, string>? OnSensorDataReceived;

    public RobotHardwareClient()
    {
    }

    private class OdometryTracker
    {
        public double X { get; set; }
        public double Y { get; set; }
        public double Angle { get; set; }
        public double VelocityX { get; set; }
        public double VelocityY { get; set; }
        public string CurrentCommand { get; set; } = "stop";
        private double _timeStill = 0;
        public string BlockedCommand { get; set; } = null;

        public void Update(double dt, double accelX, double accelY, double gyroZ_rad)
        {
            if (dt <= 0) return;

            Angle += gyroZ_rad * dt;

            if (CurrentCommand != "stop" && CurrentCommand != BlockedCommand)
            {
                BlockedCommand = null;
            }

            double targetSpeed = 0;
            if (CurrentCommand == "forward") targetSpeed = 1.0;
            else if (CurrentCommand == "backward") targetSpeed = -1.0;
            else if (CurrentCommand == "forward_left" || CurrentCommand == "forward_right") targetSpeed = 0.5;
            else if (CurrentCommand == "backward_left" || CurrentCommand == "backward_right") targetSpeed = -0.5;
            else targetSpeed = 0;

            bool isPhysicallyStill = (Math.Abs(accelX) < 0.1 && Math.Abs(accelY) < 0.1 && Math.Abs(gyroZ_rad) < 0.05);

            if (targetSpeed != 0 && isPhysicallyStill)
            {
                _timeStill += dt;
                if (_timeStill > 0.4)
                {
                    BlockedCommand = CurrentCommand;
                }
            }
            else
            {
                _timeStill = 0;
            }

            if (CurrentCommand == BlockedCommand)
            {
                targetSpeed = 0;
            }

            double currentSpeed = Math.Sqrt(VelocityX * VelocityX + VelocityY * VelocityY);
            if (VelocityX * Math.Cos(Angle) + VelocityY * Math.Sin(Angle) < 0) currentSpeed = -currentSpeed;

            currentSpeed += (targetSpeed - currentSpeed) * 10.0 * dt;

            VelocityX = currentSpeed * Math.Cos(Angle);
            VelocityY = currentSpeed * Math.Sin(Angle);

            X += VelocityX * dt;
            Y += VelocityY * dt;
        }

        public double Speed => Math.Sqrt(VelocityX * VelocityX + VelocityY * VelocityY);
    }

    private class ControlConnection
    {
        public WebSocket WebSocket { get; }
        public SemaphoreSlim Lock { get; } = new(1, 1);
        public OdometryTracker Odometry { get; } = new();

        public ControlConnection(WebSocket webSocket)
        {
            WebSocket = webSocket;
        }
    }

    private class VideoChannel
    {
        private byte[]? _latestFrame;
        private TaskCompletionSource<byte[]> _frameReady =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly object _lock = new();

        public void PushFrame(byte[] frame)
        {
            lock (_lock)
            {
                _latestFrame = frame;
                var previous = _frameReady;
                _frameReady = new(TaskCreationOptions.RunContinuationsAsynchronously);
                previous.TrySetResult(frame);
            }
        }

        public byte[]? Latest
        {
            get { lock (_lock) { return _latestFrame; } }
        }

        public Task<byte[]> NextFrameAsync()
        {
            lock (_lock) { return _frameReady.Task; }
        }
    }

    public async Task HandleControlConnectionAsync(int robotId, WebSocket webSocket)
    {
        var connection = new ControlConnection(webSocket);

        if (_connections.TryGetValue(robotId, out var stale))
        {
            try { stale.WebSocket.Abort(); } catch { }
        }
        _connections[robotId] = connection;

        Console.WriteLine($"Робот {robotId} відкрив керуючий канал");

        try
        {
            await ReceiveTelemetryLoopAsync(connection, robotId);
        }
        finally
        {
            _connections.TryGetValue(robotId, out var current);
            if (ReferenceEquals(current, connection))
            {
                _connections.TryRemove(robotId, out _);
            }
            connection.Lock.Dispose();
            Console.WriteLine($"Робот {robotId} закрив керуючий канал");
        }
    }

    private async Task ReceiveTelemetryLoopAsync(ControlConnection connection, int robotId)
    {
        var buffer = new byte[4096];
        try
        {
            while (connection.WebSocket.State == WebSocketState.Open)
            {
                var result = await connection.WebSocket.ReceiveAsync(
                    new ArraySegment<byte>(buffer),
                    CancellationToken.None
                );
                if (result.MessageType == WebSocketMessageType.Close)
                    break;

                var message = Encoding.UTF8.GetString(buffer, 0, result.Count);

                try
                {
                    var root = JsonDocument.Parse(message).RootElement;
                    if (root.TryGetProperty("type", out var typeProp) && typeProp.GetString() == "telemetry")
                    {
                        double dt = root.TryGetProperty("dt", out var dtProp) ? dtProp.GetDouble() : 0;

                        var imu = root.GetProperty("imu");
                        double accelX = imu.GetProperty("accelX").GetDouble();
                        double accelY = imu.GetProperty("accelY").GetDouble();
                        double gyroZ = imu.GetProperty("gyroZ").GetDouble();

                        connection.Odometry.Update(dt, accelX, accelY, gyroZ);

                        var outData = new
                        {
                            type = "telemetry",
                            dt = dt,
                            osd = root.TryGetProperty("osd", out var osdProp) ? (JsonElement?)osdProp : null,
                            gases = root.TryGetProperty("gases", out var gasesProp) ? (JsonElement?)gasesProp : null,
                            imu = imu,
                            x = connection.Odometry.X,
                            y = connection.Odometry.Y,
                            angle = connection.Odometry.Angle,
                            speed = connection.Odometry.Speed
                        };
                        message = JsonSerializer.Serialize(outData);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Помилка обробки телеметрії: {ex.Message}");
                }

                OnSensorDataReceived?.Invoke(robotId, message);
            }
        }
        catch { }
    }

    public async Task SendCommandAsync(string command, int robotId)
    {
        if (!_connections.TryGetValue(robotId, out var connection))
        {
            Console.WriteLine($"Неможливо відправити команду: робот {robotId} не на зв'язку");
            return;
        }

        await connection.Lock.WaitAsync();
        try
        {
            if (connection.WebSocket.State == WebSocketState.Open)
            {
                var buffer = new ArraySegment<byte>(Encoding.UTF8.GetBytes(command));
                await connection.WebSocket.SendAsync(
                    buffer,
                    WebSocketMessageType.Text,
                    true,
                    CancellationToken.None
                );

                connection.Odometry.CurrentCommand = command;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Помилка зв'язку з роботом {robotId}: {ex.Message}");
            connection.WebSocket.Abort();
            _connections.TryRemove(robotId, out _);
        }
        finally
        {
            connection.Lock.Release();
        }
    }

    public bool IsOnline(int robotId)
    {
        return _connections.TryGetValue(robotId, out var c)
            && c.WebSocket.State == WebSocketState.Open;
    }

    public async Task HandleVideoConnectionAsync(int robotId, WebSocket webSocket)
    {
        var channel = _videoChannels.GetOrAdd(robotId, _ => new VideoChannel());
        Console.WriteLine($"Робот {robotId} відкрив відеоканал");

        var buffer = new byte[64 * 1024];
        using var frameBuffer = new MemoryStream();
        try
        {
            while (webSocket.State == WebSocketState.Open)
            {
                frameBuffer.SetLength(0);
                WebSocketReceiveResult result;
                do
                {
                    result = await webSocket.ReceiveAsync(
                        new ArraySegment<byte>(buffer),
                        CancellationToken.None
                    );
                    if (result.MessageType == WebSocketMessageType.Close)
                        break;
                    frameBuffer.Write(buffer, 0, result.Count);
                }
                while (!result.EndOfMessage);

                if (result.MessageType == WebSocketMessageType.Close)
                    break;

                if (frameBuffer.Length > 0)
                {
                    channel.PushFrame(frameBuffer.ToArray());
                }
            }
        }
        catch { }
        finally
        {
            Console.WriteLine($"Робот {robotId} закрив відеоканал");
        }
    }

    public byte[]? GetLatestFrame(int robotId)
    {
        return _videoChannels.TryGetValue(robotId, out var channel) ? channel.Latest : null;
    }

    public Task<byte[]>? WaitForNextFrameAsync(int robotId)
    {
        return _videoChannels.TryGetValue(robotId, out var channel) ? channel.NextFrameAsync() : null;
    }

    public bool HasVideo(int robotId)
    {
        return _videoChannels.ContainsKey(robotId);
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var connection in _connections.Values)
        {
            try { connection.WebSocket.Abort(); } catch { }
        }
        _connections.Clear();
        _videoChannels.Clear();
        await Task.CompletedTask;
    }
}
