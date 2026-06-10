using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AirTracker_API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class VideoController : ControllerBase
    {
        private readonly RobotHardwareClient _hardwareClient;

        public VideoController(RobotHardwareClient hardwareClient)
        {
            _hardwareClient = hardwareClient;
        }

        [HttpGet("{robotId:int}")]
        public async Task Stream(int robotId)
        {
            const string boundary = "frame";
            Response.ContentType = $"multipart/x-mixed-replace; boundary={boundary}";
            Response.Headers["Cache-Control"] = "no-cache, no-store";
            Response.Headers["Pragma"] = "no-cache";

            var cancellation = HttpContext.RequestAborted;
            var body = Response.Body;
            var latest = _hardwareClient.GetLatestFrame(robotId);
            if (latest is not null)
            {
                await WriteFrameAsync(body, boundary, latest, cancellation);
            }

            try
            {
                while (!cancellation.IsCancellationRequested)
                {
                    var nextFrameTask = _hardwareClient.WaitForNextFrameAsync(robotId);
                    if (nextFrameTask is null)
                    {
                        await Task.Delay(200, cancellation);
                        continue;
                    }

                    var frame = await nextFrameTask.WaitAsync(cancellation);
                    await WriteFrameAsync(body, boundary, frame, cancellation);
                }
            }
            catch (OperationCanceledException)
            {
            }
        }

        private static async Task WriteFrameAsync(
            Stream body,
            string boundary,
            byte[] frame,
            CancellationToken ct)
        {
            var header = Encoding.ASCII.GetBytes(
                $"\r\n--{boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: {frame.Length}\r\n\r\n"
            );
            await body.WriteAsync(header, ct);
            await body.WriteAsync(frame, ct);
            await body.FlushAsync(ct);
        }
    }
}
