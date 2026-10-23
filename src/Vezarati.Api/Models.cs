using Microsoft.EntityFrameworkCore;
using System.Text.Json.Serialization;

namespace Vezarati.Api.Models;

public sealed class Resolution
{
    public int Id { get; set; }
    public DateOnly MeetingDate { get; set; }
    public string MeetingDateJalali { get; set; } = "";
    public DateOnly? StartDate { get; set; }
    public string StartDateJalali { get; set; } = "";
    public DateOnly? DueDate { get; set; }
    public string DueDateJalali { get; set; } = "";
    public bool RequiresPeriodicReport { get; set; }
    public string ReportFrequency { get; set; } = "";
    public string CancellationReason { get; set; } = "";
    public string Number { get; set; } = "";
    public string Text { get; set; } = "";
    public string Notes { get; set; } = "";
    public string Status { get; set; } = "before";
    public bool PublishToAll { get; set; }
    public bool IsArchived { get; set; }
    public string? SourceKey { get; set; }
    public int? GroupId { get; set; }
    public ResolutionGroup? Group { get; set; }
    public List<ResolutionGroupAssignment> GroupAssignments { get; set; } = [];
    public List<ResolutionAssignment> Assignments { get; set; } = [];
    public List<ResolutionProgress> Progress { get; set; } = [];
    public List<ResolutionAttachment> Attachments { get; set; } = [];
    public List<ResolutionEvent> Events { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }
    public string CreatedBy { get; set; } = "";
}

public sealed class ResolutionReport
{
    public int Id { get; set; }
    public int ResolutionId { get; set; }
    [JsonIgnore]
    public Resolution? Resolution { get; set; }
    public string NationalId { get; set; } = "";
    public string UserName { get; set; } = "";
    public string Text { get; set; } = "";
    public string ReportType { get; set; } = "completion";
    public string PeriodKey { get; set; } = "";
    public DateTimeOffset SubmittedAt { get; set; }
}

public sealed class ResolutionGroup
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Category { get; set; } = "";
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
    public string ReportText { get; set; } = "";
    public string ApprovalStatus { get; set; } = "none";
    public string AdminFeedback { get; set; } = "";
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class ResolutionEvent
{
    public int Id { get; set; }
    public int ResolutionId { get; set; }
    [JsonIgnore]
    public Resolution? Resolution { get; set; }
    public string NationalId { get; set; } = "";
    public string UserName { get; set; } = "";
    public string Text { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class UserNotification
{
    public int Id { get; set; }
    public string NationalId { get; set; } = "";
    public int? ResolutionId { get; set; }
    public string Type { get; set; } = "";
    public string Text { get; set; } = "";
    public string DateKey { get; set; } = "";
    public bool IsRead { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class ResolutionAttachment
{
    public int Id { get; set; }
    public int ResolutionId { get; set; }
    [JsonIgnore]
    public Resolution? Resolution { get; set; }
    public string OriginalName { get; set; } = "";
    public string StoredName { get; set; } = "";
    public string ContentType { get; set; } = "application/octet-stream";
    public long Size { get; set; }
    public string UploadedBy { get; set; } = "";
    public string UploaderName { get; set; } = "";
    public bool ApprovedForAll { get; set; }
    public DateTimeOffset UploadedAt { get; set; }
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
    public string Role { get; set; } = "کاربر";
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string Father { get; set; } = "";
    public int? Gender { get; set; }
    public string BirthDate { get; set; } = "";
    public string PersianBirthDate { get; set; } = "";
    public string Mobile { get; set; } = "";
    public bool MobileOverriddenByAdmin { get; set; }
    public int? UserType { get; set; }
    public string PersonnelCode { get; set; } = "";
    public string OrgPositionCode { get; set; } = "";
    public string OrgPositionDesc { get; set; } = "";
    public int? OrgPositionTypeCode { get; set; }
    public string OrgPositionTypeDesc { get; set; } = "";
    public int? RegionId { get; set; }
    public DateTimeOffset? LastLoginAt { get; set; }
}

public sealed class SetUserRoleRequest
{
    public bool IsAdmin { get; set; }
}

public sealed class UpdateMobileRequest
{
    public string Mobile { get; set; } = "";
}

public sealed class AppDb(DbContextOptions<AppDb> options) : DbContext(options)
{
    public DbSet<Resolution> Resolutions => Set<Resolution>();
    public DbSet<ResolutionReport> ResolutionReports => Set<ResolutionReport>();
    public DbSet<ResolutionGroup> Groups => Set<ResolutionGroup>();
    public DbSet<ResolutionGroupAssignment> ResolutionGroups => Set<ResolutionGroupAssignment>();
    public DbSet<GroupMember> GroupMembers => Set<GroupMember>();
    public DbSet<ResolutionAssignment> Assignments => Set<ResolutionAssignment>();
    public DbSet<ResolutionProgress> Progress => Set<ResolutionProgress>();
    public DbSet<ResolutionAttachment> Attachments => Set<ResolutionAttachment>();
    public DbSet<ResolutionEvent> Events => Set<ResolutionEvent>();
    public DbSet<UserNotification> Notifications => Set<UserNotification>();
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
        model.Entity<ResolutionAttachment>().ToTable("ResolutionAttachments");
        model.Entity<UserNotification>().HasIndex(x => new { x.NationalId, x.ResolutionId, x.Type, x.DateKey }).IsUnique();
        model.Entity<ResolutionEvent>().ToTable("ResolutionEvents");
        model.Entity<ResolutionReport>().ToTable("ResolutionReports");
        model.Entity<ResolutionReport>().HasIndex(x => new { x.ResolutionId, x.NationalId, x.PeriodKey }).IsUnique();
        model.Entity<ResolutionReport>().HasOne(x => x.Resolution).WithMany().HasForeignKey(x => x.ResolutionId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<ResolutionEvent>().HasOne(x => x.Resolution).WithMany(x => x.Events).HasForeignKey(x => x.ResolutionId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<ResolutionAttachment>().HasOne(x => x.Resolution).WithMany(x => x.Attachments).HasForeignKey(x => x.ResolutionId).OnDelete(DeleteBehavior.Cascade);
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
                var allSeedGroupNames = seed.Groups.Keys.Concat(seed.Resolutions.SelectMany(item => item.Groups)).Distinct(StringComparer.Ordinal).ToList();
                foreach (var groupName in allSeedGroupNames)
                {
                    if (groups.ContainsKey(groupName)) continue;
                    var group = await db.Groups.Include(g => g.Members).FirstOrDefaultAsync(g => g.Name == groupName);
                    if (group is null)
                    {
                        group = new ResolutionGroup { Name = groupName };
                        db.Groups.Add(group);
                    }
                    groups[groupName] = group;
                }
                await db.SaveChangesAsync();

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
                    var date = JalaliDate.ToGregorian(item.MeetingDateJalali);
                    var resolution = await db.Resolutions.Include(r => r.GroupAssignments).FirstOrDefaultAsync(r => r.SourceKey == item.SourceKey);
                    if (resolution is null)
                    {
                        var candidates = await db.Resolutions.Include(r => r.GroupAssignments)
                            .Where(r => r.MeetingDate == date && r.Number == item.Number).ToListAsync();
                        var normalizedText = NormalizeImportedText(item.Text);
                        resolution = candidates.FirstOrDefault(candidate => NormalizeImportedText(candidate.Text) == normalizedText);
                    }
                    if (resolution is null)
                    {
                        resolution = new Resolution { SourceKey = item.SourceKey, MeetingDate = date, MeetingDateJalali = item.MeetingDateJalali, Number = item.Number, Text = item.Text, Notes = item.Notes, Status = item.Status, CreatedAt = DateTimeOffset.UtcNow, CreatedBy = "ورود از فایل اکسل" };
                        db.Resolutions.Add(resolution);
                    }
                    else
                    {
                        if (string.IsNullOrWhiteSpace(resolution.SourceKey)) resolution.SourceKey = item.SourceKey;
                        if (string.IsNullOrWhiteSpace(resolution.MeetingDateJalali)) resolution.MeetingDateJalali = item.MeetingDateJalali;
                    }
                    foreach (var groupName in item.Groups)
                        if (groups.TryGetValue(groupName, out var group) && resolution.GroupAssignments.All(a => a.GroupId != group.Id))
                            resolution.GroupAssignments.Add(new ResolutionGroupAssignment { Group = group });
                }
                await db.SaveChangesAsync();
            }
        }
        if (!await db.Users.AnyAsync()) db.Users.Add(new AppUser { NationalId = "admin", DisplayName = "مدیر دفتر وزارتی", Role = "ادمین" });
        await db.SaveChangesAsync();
    }

    private static string NormalizeImportedText(string value) => string.Join(" ",
        value.Replace('\u200c', ' ').Replace('ي', 'ی').Replace('ك', 'ک')
            .Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
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
        if (columns.Count > 0 && !columns.Contains("StartDate")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE Resolutions ADD COLUMN StartDate TEXT NULL;");
        if (columns.Count > 0 && !columns.Contains("StartDateJalali")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE Resolutions ADD COLUMN StartDateJalali TEXT NOT NULL DEFAULT '';");
        if (columns.Count > 0 && !columns.Contains("RequiresPeriodicReport")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE Resolutions ADD COLUMN RequiresPeriodicReport INTEGER NOT NULL DEFAULT 0;");
        if (columns.Count > 0 && !columns.Contains("ReportFrequency")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE Resolutions ADD COLUMN ReportFrequency TEXT NOT NULL DEFAULT '';");
        if (columns.Count > 0 && !columns.Contains("CancellationReason")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE Resolutions ADD COLUMN CancellationReason TEXT NOT NULL DEFAULT '';");
        if (columns.Count > 0 && !columns.Contains("DueDate")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE Resolutions ADD COLUMN DueDate TEXT NULL;");
        if (columns.Count > 0 && !columns.Contains("DueDateJalali")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE Resolutions ADD COLUMN DueDateJalali TEXT NOT NULL DEFAULT '';");
        if (columns.Count > 0 && !columns.Contains("IsArchived")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE Resolutions ADD COLUMN IsArchived INTEGER NOT NULL DEFAULT 0;");
        if (columns.Count > 0 && !columns.Contains("PublishToAll")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE Resolutions ADD COLUMN PublishToAll INTEGER NOT NULL DEFAULT 0;");
        await db.Database.ExecuteSqlRawAsync("UPDATE Resolutions SET StartDate = MeetingDate, StartDateJalali = MeetingDateJalali WHERE StartDate IS NULL;");
        await db.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS IX_Resolutions_SourceKey ON Resolutions (SourceKey);");
        var userColumns = await ReadColumns(db, "Users");
        var userTextColumnSql = new Dictionary<string, string>
        {
            ["FirstName"] = "ALTER TABLE Users ADD COLUMN FirstName TEXT NOT NULL DEFAULT '';",
            ["LastName"] = "ALTER TABLE Users ADD COLUMN LastName TEXT NOT NULL DEFAULT '';",
            ["Father"] = "ALTER TABLE Users ADD COLUMN Father TEXT NOT NULL DEFAULT '';",
            ["BirthDate"] = "ALTER TABLE Users ADD COLUMN BirthDate TEXT NOT NULL DEFAULT '';",
            ["PersianBirthDate"] = "ALTER TABLE Users ADD COLUMN PersianBirthDate TEXT NOT NULL DEFAULT '';",
            ["Mobile"] = "ALTER TABLE Users ADD COLUMN Mobile TEXT NOT NULL DEFAULT '';",
            ["MobileOverriddenByAdmin"] = "ALTER TABLE Users ADD COLUMN MobileOverriddenByAdmin INTEGER NOT NULL DEFAULT 0;",
            ["PersonnelCode"] = "ALTER TABLE Users ADD COLUMN PersonnelCode TEXT NOT NULL DEFAULT '';",
            ["OrgPositionCode"] = "ALTER TABLE Users ADD COLUMN OrgPositionCode TEXT NOT NULL DEFAULT '';",
            ["OrgPositionDesc"] = "ALTER TABLE Users ADD COLUMN OrgPositionDesc TEXT NOT NULL DEFAULT '';",
            ["OrgPositionTypeDesc"] = "ALTER TABLE Users ADD COLUMN OrgPositionTypeDesc TEXT NOT NULL DEFAULT '';"
        };
        foreach (var (column, sql) in userTextColumnSql)
            if (userColumns.Count > 0 && !userColumns.Contains(column))
                await db.Database.ExecuteSqlRawAsync(sql);
        var userNullableColumnSql = new Dictionary<string, string>
        {
            ["Gender"] = "ALTER TABLE Users ADD COLUMN Gender INTEGER NULL;",
            ["UserType"] = "ALTER TABLE Users ADD COLUMN UserType INTEGER NULL;",
            ["OrgPositionTypeCode"] = "ALTER TABLE Users ADD COLUMN OrgPositionTypeCode INTEGER NULL;",
            ["RegionId"] = "ALTER TABLE Users ADD COLUMN RegionId INTEGER NULL;",
            ["LastLoginAt"] = "ALTER TABLE Users ADD COLUMN LastLoginAt TEXT NULL;"
        };
        foreach (var (column, sql) in userNullableColumnSql)
            if (userColumns.Count > 0 && !userColumns.Contains(column))
                await db.Database.ExecuteSqlRawAsync(sql);
        var groupColumns = await ReadColumns(db, "Groups");
        if (groupColumns.Count > 0 && !groupColumns.Contains("Category")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE Groups ADD COLUMN Category TEXT NOT NULL DEFAULT '';");
        var directoryColumns = await ReadColumns(db, "Directory");
        if (directoryColumns.Count > 0 && !directoryColumns.Contains("Title")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE Directory ADD COLUMN Title TEXT NOT NULL DEFAULT '';");
        await db.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS ResolutionReports (Id INTEGER NOT NULL CONSTRAINT PK_ResolutionReports PRIMARY KEY AUTOINCREMENT, ResolutionId INTEGER NOT NULL, NationalId TEXT NOT NULL, UserName TEXT NOT NULL DEFAULT '', Text TEXT NOT NULL DEFAULT '', ReportType TEXT NOT NULL DEFAULT 'completion', PeriodKey TEXT NOT NULL DEFAULT '', SubmittedAt TEXT NOT NULL, CONSTRAINT FK_ResolutionReports_Resolutions_ResolutionId FOREIGN KEY (ResolutionId) REFERENCES Resolutions (Id) ON DELETE CASCADE);");
        await db.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS IX_ResolutionReports_ResolutionId_NationalId_PeriodKey ON ResolutionReports (ResolutionId, NationalId, PeriodKey);");
        await db.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS ResolutionGroups (ResolutionId INTEGER NOT NULL, GroupId INTEGER NOT NULL, CONSTRAINT PK_ResolutionGroups PRIMARY KEY (ResolutionId, GroupId), CONSTRAINT FK_ResolutionGroups_Resolutions_ResolutionId FOREIGN KEY (ResolutionId) REFERENCES Resolutions (Id) ON DELETE CASCADE, CONSTRAINT FK_ResolutionGroups_Groups_GroupId FOREIGN KEY (GroupId) REFERENCES Groups (Id) ON DELETE CASCADE);");
        await db.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS ResolutionProgress (Id INTEGER NOT NULL CONSTRAINT PK_ResolutionProgress PRIMARY KEY AUTOINCREMENT, ResolutionId INTEGER NOT NULL, NationalId TEXT NOT NULL, Status TEXT NOT NULL DEFAULT 'before', Notes TEXT NOT NULL DEFAULT '', UpdatedAt TEXT NOT NULL, CONSTRAINT FK_ResolutionProgress_Resolutions_ResolutionId FOREIGN KEY (ResolutionId) REFERENCES Resolutions (Id) ON DELETE CASCADE);");
        await db.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS IX_ResolutionProgress_ResolutionId_NationalId ON ResolutionProgress (ResolutionId, NationalId);");
        var progressColumns = await ReadColumns(db, "ResolutionProgress");
        if (progressColumns.Count > 0 && !progressColumns.Contains("ReportText")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE ResolutionProgress ADD COLUMN ReportText TEXT NOT NULL DEFAULT '';");
        if (progressColumns.Count > 0 && !progressColumns.Contains("ApprovalStatus")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE ResolutionProgress ADD COLUMN ApprovalStatus TEXT NOT NULL DEFAULT 'none';");
        if (progressColumns.Count > 0 && !progressColumns.Contains("AdminFeedback")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE ResolutionProgress ADD COLUMN AdminFeedback TEXT NOT NULL DEFAULT '';");
        await db.Database.ExecuteSqlRawAsync("INSERT INTO ResolutionReports (ResolutionId, NationalId, UserName, Text, ReportType, PeriodKey, SubmittedAt) SELECT p.ResolutionId, p.NationalId, COALESCE(d.DisplayName, p.NationalId), p.ReportText, 'completion', 'legacy:' || p.ResolutionId || ':' || p.NationalId, p.UpdatedAt FROM ResolutionProgress p LEFT JOIN Directory d ON d.NationalId = p.NationalId WHERE length(trim(p.ReportText)) > 0 AND NOT EXISTS (SELECT 1 FROM ResolutionReports r WHERE r.ResolutionId = p.ResolutionId AND r.NationalId = p.NationalId AND r.PeriodKey = 'legacy:' || p.ResolutionId || ':' || p.NationalId);");
        await db.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS ResolutionAttachments (Id INTEGER NOT NULL CONSTRAINT PK_ResolutionAttachments PRIMARY KEY AUTOINCREMENT, ResolutionId INTEGER NOT NULL, OriginalName TEXT NOT NULL, StoredName TEXT NOT NULL, ContentType TEXT NOT NULL DEFAULT 'application/octet-stream', Size INTEGER NOT NULL, UploadedBy TEXT NOT NULL, UploaderName TEXT NOT NULL DEFAULT '', ApprovedForAll INTEGER NOT NULL DEFAULT 0, UploadedAt TEXT NOT NULL, CONSTRAINT FK_ResolutionAttachments_Resolutions_ResolutionId FOREIGN KEY (ResolutionId) REFERENCES Resolutions (Id) ON DELETE CASCADE);");
        var attachmentColumns = await ReadColumns(db, "ResolutionAttachments");
        if (attachmentColumns.Count > 0 && !attachmentColumns.Contains("UploaderName")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE ResolutionAttachments ADD COLUMN UploaderName TEXT NOT NULL DEFAULT '';");
        if (attachmentColumns.Count > 0 && !attachmentColumns.Contains("ApprovedForAll")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE ResolutionAttachments ADD COLUMN ApprovedForAll INTEGER NOT NULL DEFAULT 0;");
        await db.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS ResolutionEvents (Id INTEGER NOT NULL CONSTRAINT PK_ResolutionEvents PRIMARY KEY AUTOINCREMENT, ResolutionId INTEGER NOT NULL, NationalId TEXT NOT NULL, UserName TEXT NOT NULL, Text TEXT NOT NULL, CreatedAt TEXT NOT NULL, CONSTRAINT FK_ResolutionEvents_Resolutions_ResolutionId FOREIGN KEY (ResolutionId) REFERENCES Resolutions (Id) ON DELETE CASCADE);");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_ResolutionEvents_ResolutionId_CreatedAt ON ResolutionEvents (ResolutionId, CreatedAt);");
        await db.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS Notifications (Id INTEGER NOT NULL CONSTRAINT PK_Notifications PRIMARY KEY AUTOINCREMENT, NationalId TEXT NOT NULL, ResolutionId INTEGER NULL, Type TEXT NOT NULL, Text TEXT NOT NULL, DateKey TEXT NOT NULL DEFAULT '', IsRead INTEGER NOT NULL DEFAULT 0, CreatedAt TEXT NOT NULL);");
        var notificationColumns = await ReadColumns(db, "Notifications");
        var notificationColumnSql = new Dictionary<string, string>
        {
            ["NationalId"] = "ALTER TABLE Notifications ADD COLUMN NationalId TEXT NOT NULL DEFAULT '';",
            ["ResolutionId"] = "ALTER TABLE Notifications ADD COLUMN ResolutionId INTEGER NULL;",
            ["Type"] = "ALTER TABLE Notifications ADD COLUMN Type TEXT NOT NULL DEFAULT '';",
            ["Text"] = "ALTER TABLE Notifications ADD COLUMN Text TEXT NOT NULL DEFAULT '';",
            ["DateKey"] = "ALTER TABLE Notifications ADD COLUMN DateKey TEXT NOT NULL DEFAULT '';",
            ["IsRead"] = "ALTER TABLE Notifications ADD COLUMN IsRead INTEGER NOT NULL DEFAULT 0;",
            ["CreatedAt"] = "ALTER TABLE Notifications ADD COLUMN CreatedAt TEXT NOT NULL DEFAULT '1970-01-01T00:00:00+00:00';"
        };
        foreach (var (column, sql) in notificationColumnSql)
            if (notificationColumns.Count > 0 && !notificationColumns.Contains(column))
                await db.Database.ExecuteSqlRawAsync(sql);
        await db.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS IX_Notifications_NationalId_ResolutionId_Type_DateKey ON Notifications (NationalId, ResolutionId, Type, DateKey);");
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

public sealed class MessageDispatcher(IHttpClientFactory clients, IConfiguration configuration, ILogger<MessageDispatcher> logger)
{
    private readonly SemaphoreSlim _tokenLock = new(1, 1);
    private string? _cachedToken;
    private DateTimeOffset _tokenExpiresAt;

    public async Task<bool> SendAsync(string mobile, string text, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(mobile)) return false;
        try
        {
            var token = await GetTokenAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(token)) return false;
            var url = configuration["BALE_SEND_URL"] ?? configuration["Bale:SendUrl"] ?? "http://192.168.0.96:5800/api/BaleMessenger/sendMessage";
            using var request = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(
                    System.Text.Json.JsonSerializer.Serialize(new[] { new { phone = mobile, Message = text, SendType = 1 } }),
                    System.Text.Encoding.UTF8,
                    "application/json")
            };
            request.Headers.TryAddWithoutValidation("token", token);
            using var response = await clients.CreateClient("MessageApi").SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
                logger.LogWarning("Bale messaging API returned HTTP {StatusCode}.", (int)response.StatusCode);
            return response.IsSuccessStatusCode;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception exception) { logger.LogWarning(exception, "Bale messaging request failed."); return false; }
    }

    private async Task<string?> GetTokenAsync(CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(_cachedToken) && _tokenExpiresAt > DateTimeOffset.UtcNow)
            return _cachedToken;
        await _tokenLock.WaitAsync(cancellationToken);
        try
        {
            if (!string.IsNullOrWhiteSpace(_cachedToken) && _tokenExpiresAt > DateTimeOffset.UtcNow)
                return _cachedToken;
            var username = configuration["BALE_USERNAME"] ?? configuration["Bale:Username"];
            var password = configuration["BALE_PASSWORD"] ?? configuration["Bale:Password"];
            if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            {
                logger.LogWarning("Bale credentials are not configured.");
                return null;
            }
            var tokenUrl = configuration["BALE_TOKEN_URL"] ?? configuration["Bale:TokenUrl"] ?? "http://192.168.0.96:5800/user/login/GetToken";
            using var request = new HttpRequestMessage(HttpMethod.Post, tokenUrl)
            {
                Content = new StringContent(
                    System.Text.Json.JsonSerializer.Serialize(new { username, password }),
                    System.Text.Encoding.UTF8,
                    "application/json")
            };
            using var response = await clients.CreateClient("MessageApi").SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Bale token API returned HTTP {StatusCode}.", (int)response.StatusCode);
                return null;
            }
            _cachedToken = ExtractToken(body);
            if (string.IsNullOrWhiteSpace(_cachedToken))
            {
                logger.LogWarning("Bale token API response did not contain a token.");
                return null;
            }
            _tokenExpiresAt = DateTimeOffset.UtcNow.AddMinutes(20);
            return _cachedToken;
        }
        finally { _tokenLock.Release(); }
    }

    private static string? ExtractToken(string responseBody)
    {
        try
        {
            using var document = System.Text.Json.JsonDocument.Parse(responseBody);
            return FindToken(document.RootElement);
        }
        catch (System.Text.Json.JsonException)
        {
            return responseBody.Trim().Trim('"');
        }
    }

    private static string? FindToken(System.Text.Json.JsonElement element)
    {
        if (element.ValueKind == System.Text.Json.JsonValueKind.String)
            return element.GetString();
        if (element.ValueKind == System.Text.Json.JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
                if (property.Name.Equals("token", StringComparison.OrdinalIgnoreCase)
                    || property.Name.Equals("accessToken", StringComparison.OrdinalIgnoreCase)
                    || property.Name.Equals("access_token", StringComparison.OrdinalIgnoreCase)
                    || property.Name.Equals("jwt", StringComparison.OrdinalIgnoreCase))
                    return property.Value.ValueKind == System.Text.Json.JsonValueKind.String ? property.Value.GetString() : null;
            foreach (var property in element.EnumerateObject())
            {
                if ((property.Name.Equals("data", StringComparison.OrdinalIgnoreCase)
                     || property.Name.Equals("result", StringComparison.OrdinalIgnoreCase)
                     || property.Name.Equals("value", StringComparison.OrdinalIgnoreCase))
                    && property.Value.ValueKind == System.Text.Json.JsonValueKind.String)
                    return property.Value.GetString();
                if (property.Value.ValueKind is System.Text.Json.JsonValueKind.Object or System.Text.Json.JsonValueKind.Array)
                {
                    var token = FindToken(property.Value);
                    if (!string.IsNullOrWhiteSpace(token)) return token;
                }
            }
        }
        else if (element.ValueKind == System.Text.Json.JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
            {
                var token = FindToken(item);
                if (!string.IsNullOrWhiteSpace(token)) return token;
            }
        }
        return null;
    }
}
