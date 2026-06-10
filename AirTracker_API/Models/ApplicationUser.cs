using Microsoft.AspNetCore.Identity;

namespace AirTracker_API.Models
{
    public class ApplicationUser : IdentityUser
    {
        public DateTime CreatedAt { get; set; }
        public ICollection<SessionEntity> Sessions { get; set; } = new List<SessionEntity>();
    }
}
