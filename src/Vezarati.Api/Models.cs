using Microsoft.EntityFrameworkCore;

namespace Vezarati.Api.Models;

public sealed class Resolution
{
    public int Id { get; set; }
    public DateOnly MeetingDate { get; set; }
    public string Number { get; set; } = "";
    public string Text { get; set; } = "";
    public string Notes { get; set; } = "";
    public string Status { get; set; } = "before";
    public int? GroupId { get; set; }
    public ResolutionGroup? Group { get; set; }
    public List<ResolutionAssignment> Assignments { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }
    public string CreatedBy { get; set; } = "";
}

public sealed class ResolutionGroup
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public List<GroupMember> Members { get; set; } = [];
}

public sealed class GroupMember
{
    public int Id { get; set; }
    public int GroupId { get; set; }
    public ResolutionGroup? Group { get; set; }
    public string NationalId { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string Title { get; set; } = "";
}

public sealed class ResolutionAssignment
{
    public int Id { get; set; }
    public int ResolutionId { get; set; }
    public Resolution? Resolution { get; set; }
    public string NationalId { get; set; } = "";
}

public sealed class DirectoryUser
{
    public int Id { get; set; }
    public string NationalId { get; set; } = "";
    public string DisplayName { get; set; } = "";
}

public sealed class AppUser
{
    public int Id { get; set; }
    public string NationalId { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string Role { get; set; } = "";
}

public sealed class AppDb(DbContextOptions<AppDb> options) : DbContext(options)
{
    public DbSet<Resolution> Resolutions => Set<Resolution>();
    public DbSet<ResolutionGroup> Groups => Set<ResolutionGroup>();
    public DbSet<GroupMember> GroupMembers => Set<GroupMember>();
    public DbSet<ResolutionAssignment> Assignments => Set<ResolutionAssignment>();
    public DbSet<DirectoryUser> Directory => Set<DirectoryUser>();
    public DbSet<AppUser> Users => Set<AppUser>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<ResolutionGroup>().HasIndex(x => x.Name).IsUnique();
        model.Entity<GroupMember>().HasIndex(x => new { x.GroupId, x.NationalId }).IsUnique();
        model.Entity<DirectoryUser>().HasIndex(x => x.NationalId).IsUnique();
        model.Entity<Resolution>().HasOne(x => x.Group).WithMany().HasForeignKey(x => x.GroupId).OnDelete(DeleteBehavior.SetNull);
        model.Entity<ResolutionAssignment>().HasOne(x => x.Resolution).WithMany(x => x.Assignments).HasForeignKey(x => x.ResolutionId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<GroupMember>().HasOne(x => x.Group).WithMany(x => x.Members).HasForeignKey(x => x.GroupId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed record DirectoryPerson(string NationalId, string DisplayName);
public abstract class NationalIdLookup { public abstract Task<DirectoryPerson?> FindAsync(string nationalId); }
public sealed class LocalNationalIdLookup(AppDb db) : NationalIdLookup
{
    public override async Task<DirectoryPerson?> FindAsync(string nationalId)
    {
        var value = nationalId.Trim();
        if (value.Length is < 8 or > 10 || !value.All(char.IsDigit)) return null;
        var user = await db.Directory.FirstOrDefaultAsync(x => x.NationalId == value);
        return user is null ? null : new DirectoryPerson(user.NationalId, user.DisplayName);
    }
}

public static class SeedData
{
    public static async Task Initialize(AppDb db)
    {
        if (!await db.Groups.AnyAsync()) db.Groups.AddRange(new ResolutionGroup { Name = "شورای معاونان" }, new ResolutionGroup { Name = "مدیران کل" });
        if (!await db.Directory.AnyAsync()) db.Directory.AddRange(new DirectoryUser { NationalId = "0012345678", DisplayName = "کاربر نمونه یک" }, new DirectoryUser { NationalId = "0098765432", DisplayName = "کاربر نمونه دو" }, new DirectoryUser { NationalId = "1234567890", DisplayName = "کاربر نمونه سه" });
        if (!await db.Users.AnyAsync()) db.Users.AddRange(new AppUser { NationalId = "admin", DisplayName = "مدیر دفتر وزارتی", Role = "ادمین" }, new AppUser { NationalId = "0012345678", DisplayName = "کاربر نمونه یک", Role = "کاربر" });
        await db.SaveChangesAsync();
        if (await db.Resolutions.AnyAsync()) return;
        var group = await db.Groups.FirstAsync();
        db.Resolutions.AddRange(
            new Resolution { MeetingDate = DateOnly.FromDateTime(DateTime.Today.AddDays(-10)), Number = "۱۴۰۵/۱", Text = "گزارش پیشرفت برنامه اجرایی برای بررسی به دفتر وزارتی ارسال شود.", Notes = "نمونه آزمایشی", Status = "in_progress", GroupId = group.Id, CreatedAt = DateTimeOffset.UtcNow, CreatedBy = "مدیر دفتر وزارتی" },
            new Resolution { MeetingDate = DateOnly.FromDateTime(DateTime.Today.AddDays(-30)), Number = "۱۴۰۴/۲۸", Text = "جمع‌بندی عملکرد واحدها تا پایان ماه ارائه شود.", Notes = "نمونه آزمایشی", Status = "delayed", GroupId = group.Id, CreatedAt = DateTimeOffset.UtcNow, CreatedBy = "مدیر دفتر وزارتی" });
        await db.SaveChangesAsync();
    }
}
