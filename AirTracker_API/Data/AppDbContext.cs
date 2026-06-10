using AirTracker_API.Models;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace AirTracker_API.Data
{
    public class AppDbContext : IdentityDbContext<ApplicationUser>
    {
        public AppDbContext(DbContextOptions<AppDbContext> options)
            : base(options) { }

        public DbSet<RobotEntity> Robots { get; set; }
        public DbSet<SessionEntity> Sessions { get; set; }

        protected override void OnModelCreating(ModelBuilder builder)
        {
            base.OnModelCreating(builder);

            builder
                .Entity<SessionEntity>()
                .HasOne(s => s.User)
                .WithMany(u => u.Sessions)
                .HasForeignKey(s => s.UserId);

            builder
                .Entity<SessionEntity>()
                .HasOne(s => s.Robot)
                .WithMany(r => r.Sessions)
                .HasForeignKey(s => s.RobotId);
            builder
                .Entity<SessionEntity>()
                .OwnsOne(
                    s => s.TelemetryData,
                    b =>
                    {
                        b.ToJson();
                        b.OwnsMany(
                            t => t.DataPoints,
                            dp =>
                            {
                                dp.OwnsOne(d => d.Sensors, s => 
                                {
                                    s.OwnsOne(sd => sd.Gases, g => 
                                    {
                                        g.OwnsOne(gd => gd.Mq4);
                                        g.OwnsOne(gd => gd.Mq135);
                                    });
                                    s.OwnsOne(sd => sd.Imu);
                                });
                            }
                        );
                    }
                );
        }
    }
}
