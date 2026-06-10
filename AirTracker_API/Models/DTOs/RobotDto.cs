namespace AirTracker_API.Models.DTOs
{
    public class RobotDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public bool IsOnline { get; set; }
        public bool IsBusy { get; set; }
        public string? LastKnownIp { get; set; }
        public string? HardwareToken { get; set; }
    }

    public class RobotCreateDto
    {
        public string Name { get; set; } = string.Empty;
    }

    public class RobotUpdateDto
    {
        public string Name { get; set; } = string.Empty;
        public string HardwareToken { get; set; } = string.Empty;
    }
}
