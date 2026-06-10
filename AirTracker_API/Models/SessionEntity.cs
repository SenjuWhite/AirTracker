namespace AirTracker_API.Models
{
    public class SessionEntity
    {
        public int Id { get; set; }

        public DateTime StartTime { get; set; } = DateTime.UtcNow;

        public DateTime? EndTime { get; set; }

        public string? VideoFilePath { get; set; }

        public string UserId { get; set; } = string.Empty;

        public ApplicationUser? User { get; set; }

        public int RobotId { get; set; }

        public RobotEntity? Robot { get; set; }

        public TelemetryDocument TelemetryData { get; set; }

        //public ICollection<TelemetryRecordEntity> TelemetryRecords { get; set; } = new List<TelemetryRecordEntity>();
    }

    public class TelemetryDocument
    {
        public List<DataPoint> DataPoints { get; set; } = new();
    }

    public class DataPoint
    {
        public long TimeOffsetMs { get; set; }
        public string Command { get; set; } = string.Empty;
        public double X { get; set; }
        public double Y { get; set; }
        public double Angle { get; set; }
        public double Speed { get; set; }
        public SensorData Sensors { get; set; } = new();
    }

    public class SensorData
    {
        public GasesData Gases { get; set; } = new();
        public ImuData Imu { get; set; } = new();
    }

    public class GasesData
    {
        public Mq4Data Mq4 { get; set; } = new();
        public Mq135Data Mq135 { get; set; } = new();
    }

    public class Mq4Data
    {
        public double Voltage { get; set; }
        public double Ch4 { get; set; }
    }

    public class Mq135Data
    {
        public double Voltage { get; set; }
        public double Co2 { get; set; }
        public double Co { get; set; }
        public double Alcohol { get; set; }
        public double Nh3 { get; set; }
    }

    public class ImuData
    {
        public double AccelX { get; set; }
        public double AccelY { get; set; }
        public double GyroZ { get; set; }
    }
}
