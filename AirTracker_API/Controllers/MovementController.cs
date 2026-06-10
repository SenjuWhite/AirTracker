using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class MovementController : ControllerBase
{
    private readonly RobotHardwareClient _hardwareClient;

    private static readonly HashSet<string> AllowedCommands = new(StringComparer.OrdinalIgnoreCase)
    {
        "forward",
        "backward",
        "left",
        "right",
        "forward_left",
        "forward_right",
        "backward_left",
        "backward_right",
        "stop",
    };

    public static readonly ConcurrentDictionary<int, string> ActiveSessions = new();

    public MovementController(RobotHardwareClient hardwareClient)
    {
        _hardwareClient = hardwareClient;
    }

    [HttpGet("ws/{robotId:int}")]
    public async Task GetWs(int robotId)
    {
        if (HttpContext.WebSockets.IsWebSocketRequest)
        {
            using var webSocket = await HttpContext.WebSockets.AcceptWebSocketAsync();

            var userId = User.Identity?.Name ?? "unknown";

            if (!ActiveSessions.TryAdd(robotId, userId))
            {
                Console.WriteLine($"Connection refused: Robot {robotId} is already in use by another session.");
                await webSocket.CloseAsync(
                    (WebSocketCloseStatus)4009,
                    "Robot is already in use by another session.",
                    CancellationToken.None
                );
                return;
            }
            Action<int, string> handler = async (id, data) =>
            {
                if (id == robotId && webSocket.State == WebSocketState.Open)
                {
                    var bytes = Encoding.UTF8.GetBytes(data);
                    await webSocket.SendAsync(
                        new ArraySegment<byte>(bytes),
                        WebSocketMessageType.Text,
                        true,
                        CancellationToken.None
                    );
                }
            };

            _hardwareClient.OnSensorDataReceived += handler;

            try
            {
                await ReceiveCommands(webSocket, robotId);
            }
            finally
            {
                _hardwareClient.OnSensorDataReceived -= handler;
                ActiveSessions.TryRemove(robotId, out _);
                Console.WriteLine($"Robot {robotId} is disconnected");
            }
        }
        else
        {
            HttpContext.Response.StatusCode = StatusCodes.Status400BadRequest;
        }
    }

    private async Task ReceiveCommands(WebSocket webSocket, int robotId)
    {
        var buffer = new byte[1024];

        try
        {
            while (webSocket.State == WebSocketState.Open)
            {
                var result = await webSocket.ReceiveAsync(
                    new ArraySegment<byte>(buffer),
                    CancellationToken.None
                );

                if (result.MessageType == WebSocketMessageType.Text)
                {
                    var command = Encoding.UTF8.GetString(buffer, 0, result.Count).Trim().ToLower();

                    if (AllowedCommands.Contains(command))
                    {
                        await _hardwareClient.SendCommandAsync(command, robotId);
                    }
                    else
                    {
                        Console.WriteLine($"Заблоковано невідому команду: {command}");
                    }
                }
                else if (result.MessageType == WebSocketMessageType.Close)
                {
                    await webSocket.CloseAsync(
                        WebSocketCloseStatus.NormalClosure,
                        "Клієнт відключився",
                        CancellationToken.None
                    );
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Помилка WebSocket: {ex.Message}");
        }
    }
}
