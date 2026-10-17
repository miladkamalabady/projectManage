using Microsoft.EntityFrameworkCore;
using System.Text.Json.Serialization;

namespace Vezarati.Api.Models;

public sealed class Resolution
{
    public int Id { get; set; }
    public DateOnly MeetingDate { get; set; }
    public string MeetingDateJalali { get; set; } = "";
    public string Number { get; set; } = "";
    public string Text { get; set; } = "";
    public string Notes { get; set; } = "";
    public string Status { get; set; } = "before";
    public string? SourceKey { get; set; }
    public int? GroupId { get; set; }
    public ResolutionGroup? Group { get; set; }
    public List<ResolutionGroupAssignment> GroupAssignments { get; set; } = [];
    public List<ResolutionAssignment> Assignments { get; set; } = [];
    public List<ResolutionProgress> Progress { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }
    public string CreatedBy { get; set; } = "";
}

public sealed class ResolutionGroup
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public List<GroupMember> Members { get; set; } = [];
    [JsonIgnore]
    public List<ResolutionGroupAssignment> Resolutions { get; set; } = [];
}

public sealed class ResolutionGroupAssignment
{
    public int ResolutionId { get; set; }
    [JsonIgnore]
    public Resolution? Resolution { get; set; }
    public int GroupId { get; set; }
    [JsonIgnore]
    public ResolutionGroup? Group { get; set; }
}

public sealed class GroupMember
{
    public int Id { get; set; }
    public int GroupId { get; set; }
    [JsonIgnore]
    public ResolutionGroup? Group { get; set; }
    public string NationalId { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string Title { get; set; } = "";
}

public sealed class ResolutionAssignment
{
    public int Id { get; set; }
    public int ResolutionId { get; set; }
    [JsonIgnore]
    public Resolution? Resolution { get; set; }
    public string NationalId { get; set; } = "";
}

public sealed class ResolutionProgress
{
    public int Id { get; set; }
    public int ResolutionId { get; set; }
    public string NationalId { get; set; } = "";
    public string Status { get; set; } = "before";
    public string Notes { get; set; } = "";
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class DirectoryUser
{
    public int Id { get; set; }
    public string NationalId { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string Title { get; set; } = "";
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
    public DbSet<ResolutionGroupAssignment> ResolutionGroups => Set<ResolutionGroupAssignment>();
    public DbSet<GroupMember> GroupMembers => Set<GroupMember>();
    public DbSet<ResolutionAssignment> Assignments => Set<ResolutionAssignment>();
    public DbSet<ResolutionProgress> Progress => Set<ResolutionProgress>();
    public DbSet<DirectoryUser> Directory => Set<DirectoryUser>();
    public DbSet<AppUser> Users => Set<AppUser>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<ResolutionGroup>().HasIndex(x => x.Name).IsUnique();
        model.Entity<GroupMember>().HasIndex(x => new { x.GroupId, x.NationalId }).IsUnique();
        model.Entity<DirectoryUser>().HasIndex(x => x.NationalId).IsUnique();
        model.Entity<Resolution>().HasIndex(x => x.SourceKey).IsUnique();
        model.Entity<Resolution>().HasOne(x => x.Group).WithMany().HasForeignKey(x => x.GroupId).OnDelete(DeleteBehavior.SetNull);
        model.Entity<ResolutionAssignment>().HasOne(x => x.Resolution).WithMany(x => x.Assignments).HasForeignKey(x => x.ResolutionId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<ResolutionProgress>().ToTable("ResolutionProgress");
        model.Entity<ResolutionProgress>().HasIndex(x => new { x.ResolutionId, x.NationalId }).IsUnique();
        model.Entity<ResolutionProgress>().HasOne<Resolution>().WithMany(x => x.Progress).HasForeignKey(x => x.ResolutionId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<GroupMember>().HasOne(x => x.Group).WithMany(x => x.Members).HasForeignKey(x => x.GroupId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<ResolutionGroupAssignment>().HasKey(x => new { x.ResolutionId, x.GroupId });
        model.Entity<ResolutionGroupAssignment>().HasOne(x => x.Resolution).WithMany(x => x.GroupAssignments).HasForeignKey(x => x.ResolutionId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<ResolutionGroupAssignment>().HasOne(x => x.Group).WithMany(x => x.Resolutions).HasForeignKey(x => x.GroupId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed record DirectoryPerson(string NationalId, string DisplayName);
public abstract class NationalIdLookup { public abstract Task<DirectoryPerson?> FindAsync(string nationalId); }
public sealed class LocalNationalIdLookup(AppDb db) : NationalIdLookup
{
    public override async Task<DirectoryPerson?> FindAsync(string nationalId)
    {
        var value = nationalId.Trim();
        if (value.Length is < 8 or > 11 || !value.All(char.IsDigit)) return null;
        var user = await db.Directory.FirstOrDefaultAsync(x => x.NationalId == value);
        return user is null ? null : new DirectoryPerson(user.NationalId, user.DisplayName);
    }
}

public static class SeedData
{
    private sealed record SeedMember(string NationalId, string DisplayName, string Title);
    private sealed record SeedResolution(string SourceKey, string MeetingDateJalali, string Number, string Text, string Notes, string Status, List<string> Groups);
    private sealed record SeedDocument(Dictionary<string, List<SeedMember>> Groups, List<SeedResolution> Resolutions);

    public static async Task Initialize(AppDb db, IWebHostEnvironment environment)
    {
        var groups = new Dictionary<string, ResolutionGroup>();
        foreach (var name in new[] { "شورای معاونان", "مدیران کل" })
        {
            var group = await db.Groups.Include(g => g.Members).FirstOrDefaultAsync(g => g.Name == name);
            if (group is null) { group = new ResolutionGroup { Name = name }; db.Groups.Add(group); }
            groups[name] = group;
        }
        await db.SaveChangesAsync();

        var dataPath = Path.Combine(environment.ContentRootPath, "Data", "seed.json");
        if (!File.Exists(dataPath)) dataPath = Path.Combine(AppContext.BaseDirectory, "Data", "seed.json");
        if (File.Exists(dataPath))
        {
            // IDs shared across groups must be inserted only once, including unsaved tracked entities.
            var directoryUsers = await db.Directory.ToDictionaryAsync(x => x.NationalId, StringComparer.Ordinal);
            var seed = System.Text.Json.JsonSerializer.Deserialize<SeedDocument>(await File.ReadAllTextAsync(dataPath), new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (seed is not null)
            {
                foreach (var (groupName, members) in seed.Groups)
                {
                    if (!groups.TryGetValue(groupName, out var group)) continue;
                    foreach (var member in members)
                    {
                        if (!directoryUsers.TryGetValue(member.NationalId, out var directory))
                        {
                            directory = new DirectoryUser { NationalId = member.NationalId, DisplayName = member.DisplayName, Title = member.Title };
                            db.Directory.Add(directory);
                            directoryUsers.Add(member.NationalId, directory);
                        }
                        else { directory.DisplayName = member.DisplayName; if (!string.IsNullOrWhiteSpace(member.Title)) directory.Title = member.Title; }
                        var groupMember = group.Members.FirstOrDefault(x => x.NationalId == member.NationalId);
                        if (groupMember is null) group.Members.Add(new GroupMember { NationalId = member.NationalId, DisplayName = member.DisplayName, Title = member.Title });
                        else { groupMember.DisplayName = member.DisplayName; groupMember.Title = member.Title; }
                    }
                }
                await db.SaveChangesAsync();
                foreach (var item in seed.Resolutions)
                {
                    var resolution = await db.Resolutions.Include(r => r.GroupAssignments).FirstOrDefaultAsync(r => r.SourceKey == item.SourceKey);
                    if (resolution is null)
                    {
                        var date = JalaliDate.ToGregorian(item.MeetingDateJalali);
                        resolution = new Resolution { SourceKey = item.SourceKey, MeetingDate = date, MeetingDateJalali = item.MeetingDateJalali, Number = item.Number, Text = item.Text, Notes = item.Notes, Status = item.Status, CreatedAt = DateTimeOffset.UtcNow, CreatedBy = "ورود از فایل اکسل" };
                        db.Resolutions.Add(resolution);
                        foreach (var groupName in item.Groups) if (groups.TryGetValue(groupName, out var group) && resolution.GroupAssignments.All(a => a.GroupId != group.Id)) resolution.GroupAssignments.Add(new ResolutionGroupAssignment { Group = group });
                    }
                    else foreach (var groupName in item.Groups) if (groups.TryGetValue(groupName, out var group) && resolution.GroupAssignments.All(a => a.GroupId != group.Id)) resolution.GroupAssignments.Add(new ResolutionGroupAssignment { Group = group });
                }
                await db.SaveChangesAsync();
            }
        }
        if (!await db.Users.AnyAsync()) db.Users.Add(new AppUser { NationalId = "admin", DisplayName = "مدیر دفتر وزارتی", Role = "ادمین" });
        await db.SaveChangesAsync();
    }
}

public static class JalaliDate
{
    public static string FromGregorian(DateOnly date)
    {
        var gy = date.Year - 1600; var gm = date.Month - 1; var gd = date.Day - 1;
        var gdm = new[] { 31, (DateTime.IsLeapYear(date.Year) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
        var days = 365 * gy + (gy + 3) / 4 - (gy + 99) / 100 + (gy + 399) / 400;
        for (var i = 0; i < gm; i++) days += gdm[i]; days += gd;
        var jDays = days - 79; var jNp = jDays / 12053; jDays %= 12053;
        var jy = 979 + 33 * jNp + 4 * (jDays / 1461); jDays %= 1461;
        if (jDays >= 366) { jy += (jDays - 1) / 365; jDays = (jDays - 1) % 365; }
        var jm = 0; while (jm < 11 && jDays >= (jm < 6 ? 31 : 30)) jDays -= jm++ < 6 ? 31 : 30;
        return $"{jy:0000}.{jm + 1:00}.{jDays + 1:00}";
    }

    public static DateOnly ToGregorian(string jalali)
    {
        var parts = jalali.Split('.');
        var year = int.Parse(parts[0]); var month = int.Parse(parts[1]); var day = int.Parse(parts[2].Split('-')[0]);
        // Jalali to Gregorian conversion.
        var jy = year - 979; var jm = month - 1; var jd = day - 1;
        var days = 365 * jy + (jy / 33) * 8 + ((jy % 33 + 3) / 4) + 79;
        for (var i = 0; i < jm; i++) days += i < 6 ? 31 : 30;
        days += jd;
        var gy = 1600 + 400 * (days / 146097); days %= 146097;
        var leap = true;
        if (days >= 36525) { days--; gy += 100 * (days / 36524); days %= 36524; if (days >= 365) days++; else leap = false; }
        gy += 4 * (days / 1461); days %= 1461;
        if (days >= 366) { leap = false; days--; gy += days / 365; days %= 365; }
        var monthDays = new[] { 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
        var gm = 0; while (gm < 11 && days >= monthDays[gm]) { days -= monthDays[gm]; gm++; }
        return new DateOnly(gy, gm + 1, days + 1);
    }
}

public static class SchemaCompatibility
{
    public static async Task UpgradeAsync(AppDb db)
    {
        var columns = await ReadColumns(db, "Resolutions");
        if (columns.Count > 0 && !columns.Contains("MeetingDateJalali")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE Resolutions ADD COLUMN MeetingDateJalali TEXT NOT NULL DEFAULT '';");
        if (columns.Count > 0 && !columns.Contains("SourceKey")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE Resolutions ADD COLUMN SourceKey TEXT NULL;");
        await db.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS IX_Resolutions_SourceKey ON Resolutions (SourceKey);");
        var directoryColumns = await ReadColumns(db, "Directory");
        if (directoryColumns.Count > 0 && !directoryColumns.Contains("Title")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE Directory ADD COLUMN Title TEXT NOT NULL DEFAULT '';");
        await db.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS ResolutionGroups (ResolutionId INTEGER NOT NULL, GroupId INTEGER NOT NULL, CONSTRAINT PK_ResolutionGroups PRIMARY KEY (ResolutionId, GroupId), CONSTRAINT FK_ResolutionGroups_Resolutions_ResolutionId FOREIGN KEY (ResolutionId) REFERENCES Resolutions (Id) ON DELETE CASCADE, CONSTRAINT FK_ResolutionGroups_Groups_GroupId FOREIGN KEY (GroupId) REFERENCES Groups (Id) ON DELETE CASCADE);");
        await db.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS ResolutionProgress (Id INTEGER NOT NULL CONSTRAINT PK_ResolutionProgress PRIMARY KEY AUTOINCREMENT, ResolutionId INTEGER NOT NULL, NationalId TEXT NOT NULL, Status TEXT NOT NULL DEFAULT 'before', Notes TEXT NOT NULL DEFAULT '', UpdatedAt TEXT NOT NULL, CONSTRAINT FK_ResolutionProgress_Resolutions_ResolutionId FOREIGN KEY (ResolutionId) REFERENCES Resolutions (Id) ON DELETE CASCADE);");
        await db.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS IX_ResolutionProgress_ResolutionId_NationalId ON ResolutionProgress (ResolutionId, NationalId);");
    }

    private static async Task<HashSet<string>> ReadColumns(AppDb db, string table)
    {
        var columns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var connection = db.Database.GetDbConnection();
        await using var command = connection.CreateCommand(); command.CommandText = $"PRAGMA table_info({table});";
        if (connection.State != System.Data.ConnectionState.Open) await connection.OpenAsync();
        await using var reader = await command.ExecuteReaderAsync(); while (await reader.ReadAsync()) columns.Add(reader.GetString(1));
        return columns;
    }
}
