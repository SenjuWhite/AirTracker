namespace AirTracker_API.Models
{
    public class RobotEntity
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string HardwareToken { get; set; } = Guid.NewGuid().ToString();
        public string LastKnownIp { get; set; } = string.Empty;
        public ICollection<SessionEntity> Sessions { get; set; } = new List<SessionEntity>();
    }
}
