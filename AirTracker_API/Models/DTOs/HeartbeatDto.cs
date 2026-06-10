namespace AirTracker_API.Models.DTOs
{
    public class HeartbeatDto
    {
        public required string HardwareToken { get; set; }
        public string? LastKnownIp { get; set; }
    }
}
