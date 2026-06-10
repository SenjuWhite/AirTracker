using Microsoft.AspNetCore.Identity;

namespace AirTracker_API.Data
{
    public class RoleSeeder
    {
        public static async Task SeedRolesAsync(IServiceProvider serviceProvider)
        {
            var roleManager = serviceProvider.GetRequiredService<RoleManager<IdentityRole>>();
            string[] roleNames = { "Admin", "Operator", "Viewer" };

            foreach (var roleName in roleNames)
            {
                var roleExist = await roleManager.RoleExistsAsync(roleName);
                if (!roleExist)
                {
                    await roleManager.CreateAsync(new IdentityRole(roleName));
                }
            }

            var dbContext = serviceProvider.GetRequiredService<AppDbContext>();
            
            if (!dbContext.Robots.Any(r => r.Name == "Alpha Rover"))
            {
                dbContext.Robots.Add(new Models.RobotEntity { Name = "Alpha Rover", HardwareToken = Guid.NewGuid().ToString() });
            }
            if (!dbContext.Robots.Any(r => r.Name == "Beta Explorer"))
            {
                dbContext.Robots.Add(new Models.RobotEntity { Name = "Beta Explorer", HardwareToken = Guid.NewGuid().ToString() });
            }
            if (!dbContext.Robots.Any(r => r.Name == "Gamma Scout"))
            {
                dbContext.Robots.Add(new Models.RobotEntity { Name = "Gamma Scout", HardwareToken = Guid.NewGuid().ToString() });
            }
            
            await dbContext.SaveChangesAsync();

            var userManager = serviceProvider.GetRequiredService<UserManager<AirTracker_API.Models.ApplicationUser>>();
            var operatorEmail = "operator@rover.os";
            if (await userManager.FindByEmailAsync(operatorEmail) == null)
            {
                var newOp = new AirTracker_API.Models.ApplicationUser { UserName = operatorEmail, Email = operatorEmail };
                var result = await userManager.CreateAsync(newOp, "Operator123!");
                if (result.Succeeded)
                {
                    await userManager.AddToRoleAsync(newOp, "Operator");
                }
            }
        }
    }
}
