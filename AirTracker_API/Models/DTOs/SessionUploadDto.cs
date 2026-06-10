namespace AirTracker_API.Models.DTOs
{
    public class SessionUploadDto
    {
        public int RobotId { get; set; }
        public string TelemetryData { get; set; } = string.Empty;
        public IFormFile? Video { get; set; }
    }
}
