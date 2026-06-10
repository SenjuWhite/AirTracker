using System.Security.Claims;
using System.Text.Json;
using AirTracker_API.Data;
using AirTracker_API.Models;
using AirTracker_API.Models.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AirTracker_API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class SessionsController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IWebHostEnvironment _env;

        public SessionsController(AppDbContext context, IWebHostEnvironment env)
        {
            _context = context;
            _env = env;
        }

        [HttpPost]
        public async Task<IActionResult> UploadSession([FromForm] SessionUploadDto uploadDto)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userId == null)
            {
                return Unauthorized();
            }

            var session = new SessionEntity
            {
                UserId = userId,
                RobotId = uploadDto.RobotId,
                StartTime = DateTime.UtcNow,
                EndTime = DateTime.UtcNow,
            };

            if (uploadDto.Video != null)
            {
                var uploadsFolder = Path.Combine(_env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot"), "videos");
                if (!Directory.Exists(uploadsFolder))
                {
                    Directory.CreateDirectory(uploadsFolder);
                }

                var uniqueFileName = Guid.NewGuid().ToString() + "_" + uploadDto.Video.FileName;
                var filePath = Path.Combine(uploadsFolder, uniqueFileName);

                using (var fileStream = new FileStream(filePath, FileMode.Create))
                {
                    await uploadDto.Video.CopyToAsync(fileStream);
                }

                session.VideoFilePath = "/videos/" + uniqueFileName;
            }

            if (!string.IsNullOrEmpty(uploadDto.TelemetryData))
            {
                try
                {
                    var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                    var telemetryData = JsonSerializer.Deserialize<TelemetryDocument>(uploadDto.TelemetryData, options);
                    session.TelemetryData = telemetryData ?? new TelemetryDocument();
                }
                catch (Exception ex)
                {
                    return BadRequest(new { message = "Invalid Telemetry Data", error = ex.Message });
                }
            }
            else
            {
                session.TelemetryData = new TelemetryDocument();
            }

            _context.Sessions.Add(session);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Session saved successfully", sessionId = session.Id });
        }

        [HttpGet]
        public async Task<IActionResult> GetSessions()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var userRoles = User.FindAll(ClaimTypes.Role).Select(r => r.Value).ToList();

            IQueryable<SessionEntity> query = _context.Sessions
                .Include(s => s.Robot)
                .Include(s => s.User);

            if (!userRoles.Contains("Admin") && !userRoles.Contains("admin"))
            {
                query = query.Where(s => s.UserId == userId);
            }

            var sessions = await query.OrderByDescending(s => s.StartTime).ToListAsync();

            var result = sessions.Select(s => new
            {
                s.Id,
                s.StartTime,
                s.EndTime,
                s.VideoFilePath,
                RobotName = s.Robot?.Name ?? "Unknown",
                UserName = s.User?.UserName ?? "Unknown",
                DataPointsCount = s.TelemetryData?.DataPoints?.Count ?? 0
            });

            return Ok(result);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetSessionById(int id)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var userRoles = User.FindAll(ClaimTypes.Role).Select(r => r.Value).ToList();

            var session = await _context.Sessions
                .Include(s => s.Robot)
                .Include(s => s.User)
                .FirstOrDefaultAsync(s => s.Id == id);

            if (session == null)
            {
                return NotFound(new { message = "Session not found" });
            }

            if (!userRoles.Contains("Admin") && !userRoles.Contains("admin") && session.UserId != userId)
            {
                return Forbid();
            }

            var result = new
            {
                session.Id,
                session.StartTime,
                session.EndTime,
                session.VideoFilePath,
                RobotName = session.Robot?.Name ?? "Unknown",
                UserName = session.User?.UserName ?? "Unknown",
                session.TelemetryData
            };

            return Ok(result);
        }
    }
}
