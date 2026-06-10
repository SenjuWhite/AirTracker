using System.ComponentModel.DataAnnotations;

namespace AirTracker_API.Models.DTOs
{
    public class RegisterDto
    {
        [Required(ErrorMessage = "Email is mandatory")]
        [EmailAddress(ErrorMessage = "Invalid email format")]
        public string Email { get; set; }

        [Required(ErrorMessage = "Password is mandatory")]
        public string Password { get; set; }
    }
}
