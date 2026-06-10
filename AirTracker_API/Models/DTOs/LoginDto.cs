using System.ComponentModel.DataAnnotations;

namespace AirTracker_API.Models.DTOs
{
    public class LoginDto
    {
        [Required(ErrorMessage = "Email is mandatory")]
        public string Email { get; set; }

        [Required(ErrorMessage = "Password is mandatory")]
        public string Password { get; set; }
    }
}
