using System.Net.WebSockets;
using AirTracker_API.Data;
using AirTracker_API.Models;
using AirTracker_API.Models.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;

namespace AirTracker_API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class RobotsController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IDistributedCache _cache;
        private readonly RobotHardwareClient _hardwareClient;

        public RobotsController(AppDbContext db, IDistributedCache cache, RobotHardwareClient hardwareClient)
        {
            _db = db;
            _cache = cache;
            _hardwareClient = hardwareClient;
        }

        [HttpGet("control")]
        public async Task ControlChannel([FromQuery] string token)
        {
            if (!HttpContext.WebSockets.IsWebSocketRequest)
            {
                HttpContext.Response.StatusCode = StatusCodes.Status400BadRequest;
                return;
            }

            var robot = await _db.Robots.FirstOrDefaultAsync(r => r.HardwareToken == token);
            if (robot is null)
            {
                HttpContext.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return;
            }

            using var ws = await HttpContext.WebSockets.AcceptWebSocketAsync();
            await _hardwareClient.HandleControlConnectionAsync(robot.Id, ws);
        }

        [HttpGet("video")]
        public async Task VideoChannel([FromQuery] string token)
        {
            if (!HttpContext.WebSockets.IsWebSocketRequest)
            {
                HttpContext.Response.StatusCode = StatusCodes.Status400BadRequest;
                return;
            }

            var robot = await _db.Robots.FirstOrDefaultAsync(r => r.HardwareToken == token);
            if (robot is null)
            {
                HttpContext.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return;
            }

            using var ws = await HttpContext.WebSockets.AcceptWebSocketAsync();
            await _hardwareClient.HandleVideoConnectionAsync(robot.Id, ws);
        }

        [HttpPost("heartbeat")]
        public async Task<IActionResult> HeartBeat([FromBody] HeartbeatDto request)
        {
            var robot = await _db.Robots.FirstOrDefaultAsync(r =>
                r.HardwareToken == request.HardwareToken
            );
            if (robot is null)
                return NotFound();
            if (robot.LastKnownIp != request.LastKnownIp)
            {
                robot.LastKnownIp = request.LastKnownIp;
                await _db.SaveChangesAsync();
            }
            var options = new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(30),
            };
            var statusCacheKey = $"robot_online_{robot.Id}";

            await _cache.SetStringAsync(statusCacheKey, "active", options);
            var ipCacheKey = $"robot_ip_{robot.Id}";
            await _cache.SetStringAsync(ipCacheKey, request.LastKnownIp, options);
            return Ok();
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int robotId)
        {
            var robot = await _db.Robots.FirstOrDefaultAsync(r => r.Id == robotId);
            if (robot is null)
                return NotFound();
            var cacheKey = $"robot_ip_{robot.Id}";
            var ip = await _cache.GetStringAsync(cacheKey);
            var result = new RobotDto
            {
                Id = robot.Id,
                Name = robot.Name,
                LastKnownIp = ip,
            };
            return Ok(result);
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var isAdmin = User.IsInRole("Admin") || User.IsInRole("admin");
            var robots = await _db.Robots.ToListAsync();
            var result = new List<RobotDto>();

            foreach (var r in robots)
            {
                var isOnline = _hardwareClient.IsOnline(r.Id);
                var isBusy = MovementController.ActiveSessions.ContainsKey(r.Id);

                result.Add(
                    new RobotDto
                    {
                        Id = r.Id,
                        Name = r.Name,
                        LastKnownIp = r.LastKnownIp,
                        IsOnline = isOnline,
                        IsBusy = isBusy,
                        HardwareToken = isAdmin ? r.HardwareToken : null
                    }
                );
            }
            return Ok(result);
        }

        [HttpPost]
        [Authorize(Roles = "Admin,admin")]
        public async Task<IActionResult> Create([FromBody] RobotCreateDto request)
        {
            var robot = new RobotEntity { Name = request.Name };
            _db.Robots.Add(robot);
            await _db.SaveChangesAsync();
            return Ok(new RobotDto { Id = robot.Id, Name = robot.Name, LastKnownIp = robot.LastKnownIp, HardwareToken = robot.HardwareToken });
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "Admin,admin")]
        public async Task<IActionResult> Update(int id, [FromBody] RobotUpdateDto request)
        {
            var robot = await _db.Robots.FirstOrDefaultAsync(r => r.Id == id);
            if (robot is null) return NotFound();

            robot.Name = request.Name;
            if (!string.IsNullOrEmpty(request.HardwareToken))
            {
                robot.HardwareToken = request.HardwareToken;
            }
            await _db.SaveChangesAsync();
            return Ok(new RobotDto { Id = robot.Id, Name = robot.Name, LastKnownIp = robot.LastKnownIp, HardwareToken = robot.HardwareToken });
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "Admin,admin")]
        public async Task<IActionResult> Delete(int id)
        {
            var robot = await _db.Robots.FirstOrDefaultAsync(r => r.Id == id);
            if (robot is null) return NotFound();

            _db.Robots.Remove(robot);
            await _db.SaveChangesAsync();
            return Ok(new { message = "Robot deleted successfully" });
        }
    }
}
