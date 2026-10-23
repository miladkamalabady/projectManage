using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System.Text.Json.Serialization;
using System.ComponentModel.DataAnnotations.Schema;

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
    public string ApprovalStatus { get; set; } = "pending";
    public string AdminFeedback { get; set; } = "";
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
    [JsonIgnore]
    public AppUser? User { get; set; }
    [NotMapped]
    public string DisplayName { get => User?.DisplayName ?? ""; set { } }
    [NotMapped]
    public string Title { get => string.IsNullOrWhiteSpace(User?.Title) ? User?.OrgPositionDesc ?? "" : User!.Title; set { } }
    [NotMapped]
    public string OrganizationUnit { get => User?.OrganizationUnit ?? ""; set { } }
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

public sealed class BaleQueuedMessage
{
    public long Id { get; set; }
    public string NationalId { get; set; } = "";
    public string Mobile { get; set; } = "";
    public string Text { get; set; } = "";
    public string Status { get; set; } = "pending";
    public int Attempts { get; set; }
    public long CreatedAtUnixMs { get; set; }
    public long NextAttemptAtUnixMs { get; set; }
    public long? SentAtUnixMs { get; set; }
    public string LastError { get; set; } = "";
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

public sealed class AppUser
{
    public int Id { get; set; }
    public string NationalId { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string Role { get; set; } = "کاربر";
    public string Title { get; set; } = "";
    public string OrganizationUnit { get; set; } = "";
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

public sealed class UpdateUserProfileRequest
{
    public string Title { get; set; } = "";
    public string OrganizationUnit { get; set; } = "";
}

public sealed class WarningRecipientsRequest
{
    public List<string> NationalIds { get; set; } = new();
}

public sealed class BaleNotificationSettingRequest
{
    public bool Enabled { get; set; }
}

public sealed class AppSetting
{
    public string Key { get; set; } = "";
    public string Value { get; set; } = "";
}

public sealed class AppDb(DbContextOptions<AppDb> options, ILogger<AppDb> logger) : DbContext(options)
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
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<AppSetting> Settings => Set<AppSetting>();
    public DbSet<BaleQueuedMessage> BaleMessageQueue => Set<BaleQueuedMessage>();

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var pendingNotifications = ChangeTracker.Entries<UserNotification>()
            .Where(entry => entry.State == EntityState.Added && entry.Entity.Type != "bale-warning")
            .Select(entry => entry.Entity)
            .ToList();

        if (pendingNotifications.Count > 0)
        {
            try
            {
                var enabled = await Settings.AsNoTracking().AnyAsync(
                    setting => setting.Key == "BaleNotificationsEnabled" && setting.Value == "true",
                    CancellationToken.None);
                if (enabled)
                {
                    var recipientIds = pendingNotifications.Select(notification => notification.NationalId).Distinct().ToList();
                    var mobiles = await Users.AsNoTracking()
                        .Where(user => recipientIds.Contains(user.NationalId) && user.Mobile != "")
                        .Select(user => new { user.NationalId, user.Mobile })
                        .ToListAsync(CancellationToken.None);
                    var mobileById = mobiles.GroupBy(user => user.NationalId)
                        .ToDictionary(group => group.Key, group => group.First().Mobile);
                    foreach (var entry in ChangeTracker.Entries<AppUser>().Where(entry => entry.State != EntityState.Deleted && recipientIds.Contains(entry.Entity.NationalId)))
                        mobileById[entry.Entity.NationalId] = entry.Entity.Mobile;
                    foreach (var notification in pendingNotifications)
                        if (mobileById.TryGetValue(notification.NationalId, out var mobile) && !string.IsNullOrWhiteSpace(mobile))
                            BaleMessageQueue.Add(new BaleQueuedMessage
                            {
                                NationalId = notification.NationalId,
                                Mobile = mobile,
                                Text = BaleMessageText.WithDetectedResolutionTags(notification.Text),
                                Status = "pending",
                                CreatedAtUnixMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                                NextAttemptAtUnixMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                            });
                }
            }
            catch (Exception exception)
            {
                logger.LogWarning(exception, "Could not enqueue automatic Bale notifications.");
            }
        }

        return await base.SaveChangesAsync(cancellationToken);
    }

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<AppSetting>().ToTable("Settings").HasKey(x => x.Key);
        model.Entity<BaleQueuedMessage>().ToTable("BaleMessageQueue");
        model.Entity<BaleQueuedMessage>().HasIndex(x => new { x.Status, x.NextAttemptAtUnixMs, x.CreatedAtUnixMs });
        model.Entity<ResolutionGroup>().HasIndex(x => x.Name).IsUnique();
        model.Entity<GroupMember>().HasIndex(x => new { x.GroupId, x.NationalId }).IsUnique();
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
        model.Entity<AppUser>().Property(x => x.NationalId).HasMaxLength(11);
        model.Entity<GroupMember>().Property(x => x.NationalId).HasMaxLength(11);
        model.Entity<AppUser>().HasAlternateKey(x => x.NationalId);
        model.Entity<GroupMember>().HasOne(x => x.User).WithMany().HasForeignKey(x => x.NationalId).HasPrincipalKey(x => x.NationalId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<GroupMember>().Navigation(x => x.User).AutoInclude();
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
        var user = await db.Users.FirstOrDefaultAsync(x => x.NationalId == value);
        return user is null ? null : new DirectoryPerson(user.NationalId, user.DisplayName);
    }
}

public static class SeedData
{
    private sealed record SeedMember(string NationalId, string DisplayName, string Title);
    private sealed record SeedResolution(string SourceKey, string MeetingDateJalali, string Number, string Text, string Notes, string Status, List<string> Groups);
    private sealed record SeedDirectoryTitle(string NationalId, string Title);
    private sealed record SeedDocument(Dictionary<string, List<SeedMember>> Groups, List<SeedResolution> Resolutions, List<SeedDirectoryTitle>? DirectoryTitles = null);

    private static bool IsCoreOrRegionalGroup(string name)
    {
        var allowed = new[] { "شورای معاونان", "مدیران کل", "تهران، شهرستان های تهران", "تهران،قم، خراسان", "هرمزگان، بوشهر، خوزستان، سیستان" };
        static string Normalize(string value) => System.Text.RegularExpressions.Regex.Replace(value, @"[\u200c\s،؛,]+", "")
            .Replace('ي', 'ی').Replace('ى', 'ی').Replace('ك', 'ک');
        return allowed.Any(item => Normalize(item) == Normalize(name));
    }

    public static async Task Initialize(AppDb db, IWebHostEnvironment environment)
    {
        const string categoryVersionKey = "GroupCategoryClassificationV2";
        if (!await db.Settings.AnyAsync(setting => setting.Key == categoryVersionKey))
        {
            var groupsWithCanonicalCategories = await db.Groups.ToListAsync();
            foreach (var group in groupsWithCanonicalCategories)
                group.Category = IsCoreOrRegionalGroup(group.Name) ? "group" : "unit";
            db.Settings.Add(new AppSetting { Key = categoryVersionKey, Value = "1" });
            await db.SaveChangesAsync();
        }

        var groups = new Dictionary<string, ResolutionGroup>();
        foreach (var name in new[] { "شورای معاونان", "مدیران کل" })
        {
            var group = await db.Groups.Include(g => g.Members).FirstOrDefaultAsync(g => g.Name == name);
            if (group is null) { group = new ResolutionGroup { Name = name, Category = "group" }; db.Groups.Add(group); }
            groups[name] = group;
        }
        await db.SaveChangesAsync();

        var dataPath = Path.Combine(environment.ContentRootPath, "Data", "seed.json");
        if (!File.Exists(dataPath)) dataPath = Path.Combine(AppContext.BaseDirectory, "Data", "seed.json");
        if (File.Exists(dataPath))
        {
            // IDs shared across groups must be inserted only once, including unsaved tracked entities.
            var directoryUsers = await db.Users.ToDictionaryAsync(x => x.NationalId, StringComparer.Ordinal);
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
                        group = new ResolutionGroup { Name = groupName, Category = IsCoreOrRegionalGroup(groupName) ? "group" : "unit" };
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
                        if (!directoryUsers.TryGetValue(member.NationalId, out var user))
                        {
                            user = new AppUser { NationalId = member.NationalId, DisplayName = member.DisplayName, Title = member.Title };
                            db.Users.Add(user);
                            directoryUsers.Add(member.NationalId, user);
                        }
                        else if (string.IsNullOrWhiteSpace(user.DisplayName)) user.DisplayName = member.DisplayName;

                        var groupMember = group.Members.FirstOrDefault(x => x.NationalId == member.NationalId);
                        if (groupMember is null) group.Members.Add(new GroupMember { NationalId = member.NationalId });
                    }
                }
                // Reconcile official 1405 directory titles on every start until an admin edits that person's title.
                // The per-user marker also keeps the next SSO login from replacing the official title with a generic SSO post.
                foreach (var official in seed.DirectoryTitles ?? [])
                {
                    if (!directoryUsers.TryGetValue(official.NationalId, out var user) || string.IsNullOrWhiteSpace(official.Title))
                        continue;
                    var overrideKey = "UserTitleOverride:" + official.NationalId;
                    if (await db.Settings.AnyAsync(setting => setting.Key == overrideKey))
                        continue;
                    user.Title = official.Title.Trim();
                    db.Settings.Add(new AppSetting { Key = overrideKey, Value = "seed:CouncilDirectory1405" });
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
        // EnsureCreatedAsync creates the schema for a new SQL Server database. Existing installations need additive compatibility columns.
        if (db.Database.IsSqlServer())
        {
            await db.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'dbo.ResolutionReports', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.ResolutionReports', N'ApprovalStatus') IS NULL ALTER TABLE dbo.ResolutionReports ADD ApprovalStatus nvarchar(max) NOT NULL CONSTRAINT DF_ResolutionReports_ApprovalStatus DEFAULT N'pending';");
            await db.Database.ExecuteSqlRawAsync("IF OBJECT_ID(N'dbo.ResolutionReports', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.ResolutionReports', N'AdminFeedback') IS NULL ALTER TABLE dbo.ResolutionReports ADD AdminFeedback nvarchar(max) NOT NULL CONSTRAINT DF_ResolutionReports_AdminFeedback DEFAULT N'';");
            return;
        }
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
        var reportColumns = await ReadColumns(db, "ResolutionReports");
        if (reportColumns.Count > 0 && !reportColumns.Contains("ApprovalStatus")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE ResolutionReports ADD COLUMN ApprovalStatus TEXT NOT NULL DEFAULT 'pending';");
        if (reportColumns.Count > 0 && !reportColumns.Contains("AdminFeedback")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE ResolutionReports ADD COLUMN AdminFeedback TEXT NOT NULL DEFAULT '';");
        var userColumns = await ReadColumns(db, "Users");
        var userTextColumnSql = new Dictionary<string, string>
        {
            ["Title"] = "ALTER TABLE Users ADD COLUMN Title TEXT NOT NULL DEFAULT '';",
            ["OrganizationUnit"] = "ALTER TABLE Users ADD COLUMN OrganizationUnit TEXT NOT NULL DEFAULT '';",
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
        var legacyDirectoryColumns = await ReadColumns(db, "Directory");
        if (legacyDirectoryColumns.Count > 0)
        {
            await db.Database.ExecuteSqlRawAsync(@"INSERT OR IGNORE INTO Users
                (NationalId, DisplayName, Role, Title, OrganizationUnit, FirstName, LastName, Father, Gender, BirthDate, PersianBirthDate, Mobile, MobileOverriddenByAdmin, UserType, PersonnelCode, OrgPositionCode, OrgPositionDesc, OrgPositionTypeCode, OrgPositionTypeDesc, RegionId, LastLoginAt)
                SELECT d.NationalId, d.DisplayName, 'کاربر', COALESCE(d.Title, ''), '', '', '', '', NULL, '', '', '', 0, NULL, '', '', '', NULL, '', NULL, NULL
                FROM Directory d WHERE trim(COALESCE(d.NationalId, '')) <> '';");
            await db.Database.ExecuteSqlRawAsync(@"UPDATE Users SET Title = COALESCE(NULLIF(Title, ''), (SELECT d.Title FROM Directory d WHERE d.NationalId = Users.NationalId))
                WHERE EXISTS (SELECT 1 FROM Directory d WHERE d.NationalId = Users.NationalId AND trim(COALESCE(d.Title, '')) <> '');");
        }
        var legacyMembershipColumns = await ReadColumns(db, "GroupMembers");
        if (legacyMembershipColumns.Count > 0 && legacyMembershipColumns.Contains("DisplayName"))
        {
            if (legacyMembershipColumns.Contains("Title"))
            {
                await db.Database.ExecuteSqlRawAsync(@"INSERT OR IGNORE INTO Users
                    (NationalId, DisplayName, Role, Title, OrganizationUnit, FirstName, LastName, Father, Gender, BirthDate, PersianBirthDate, Mobile, MobileOverriddenByAdmin, UserType, PersonnelCode, OrgPositionCode, OrgPositionDesc, OrgPositionTypeCode, OrgPositionTypeDesc, RegionId, LastLoginAt)
                    SELECT gm.NationalId, COALESCE(gm.DisplayName, ''), 'کاربر', COALESCE(gm.Title, ''), '', '', '', '', NULL, '', '', '', 0, NULL, '', '', '', NULL, '', NULL, NULL
                    FROM GroupMembers gm WHERE trim(COALESCE(gm.NationalId, '')) <> '';");
                await db.Database.ExecuteSqlRawAsync(@"UPDATE Users SET
                    DisplayName = COALESCE(NULLIF(DisplayName, ''), (SELECT gm.DisplayName FROM GroupMembers gm WHERE gm.NationalId = Users.NationalId LIMIT 1)),
                    Title = COALESCE(NULLIF(Title, ''), (SELECT gm.Title FROM GroupMembers gm WHERE gm.NationalId = Users.NationalId LIMIT 1))
                    WHERE EXISTS (SELECT 1 FROM GroupMembers gm WHERE gm.NationalId = Users.NationalId);");
            }
            else
            {
                await db.Database.ExecuteSqlRawAsync(@"INSERT OR IGNORE INTO Users
                    (NationalId, DisplayName, Role, Title, OrganizationUnit, FirstName, LastName, Father, Gender, BirthDate, PersianBirthDate, Mobile, MobileOverriddenByAdmin, UserType, PersonnelCode, OrgPositionCode, OrgPositionDesc, OrgPositionTypeCode, OrgPositionTypeDesc, RegionId, LastLoginAt)
                    SELECT gm.NationalId, COALESCE(gm.DisplayName, ''), 'کاربر', '', '', '', '', '', NULL, '', '', '', 0, NULL, '', '', '', NULL, '', NULL, NULL
                    FROM GroupMembers gm WHERE trim(COALESCE(gm.NationalId, '')) <> '';");
                await db.Database.ExecuteSqlRawAsync(@"UPDATE Users SET
                    DisplayName = COALESCE(NULLIF(DisplayName, ''), (SELECT gm.DisplayName FROM GroupMembers gm WHERE gm.NationalId = Users.NationalId LIMIT 1))
                    WHERE EXISTS (SELECT 1 FROM GroupMembers gm WHERE gm.NationalId = Users.NationalId);");
            }
        }
        if (legacyMembershipColumns.Contains("DisplayName"))
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE GroupMembers DROP COLUMN DisplayName;");
        if (legacyMembershipColumns.Contains("Title"))
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE GroupMembers DROP COLUMN Title;");
        if (legacyDirectoryColumns.Count > 0)
            await db.Database.ExecuteSqlRawAsync("DROP TABLE Directory;");
        await db.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS IX_Users_NationalId ON Users (NationalId);");
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
        await db.Database.ExecuteSqlRawAsync("INSERT INTO ResolutionReports (ResolutionId, NationalId, UserName, Text, ReportType, PeriodKey, SubmittedAt) SELECT p.ResolutionId, p.NationalId, COALESCE(u.DisplayName, p.NationalId), p.ReportText, 'completion', 'legacy:' || p.ResolutionId || ':' || p.NationalId, p.UpdatedAt FROM ResolutionProgress p LEFT JOIN Users u ON u.NationalId = p.NationalId WHERE length(trim(p.ReportText)) > 0 AND NOT EXISTS (SELECT 1 FROM ResolutionReports r WHERE r.ResolutionId = p.ResolutionId AND r.NationalId = p.NationalId AND r.PeriodKey = 'legacy:' || p.ResolutionId || ':' || p.NationalId);");
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
        await db.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS Settings (Key TEXT NOT NULL CONSTRAINT PK_Settings PRIMARY KEY, Value TEXT NOT NULL DEFAULT '');");
        await db.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS BaleMessageQueue (Id INTEGER NOT NULL CONSTRAINT PK_BaleMessageQueue PRIMARY KEY AUTOINCREMENT, NationalId TEXT NOT NULL, Mobile TEXT NOT NULL, Text TEXT NOT NULL, Status TEXT NOT NULL DEFAULT 'pending', Attempts INTEGER NOT NULL DEFAULT 0, CreatedAtUnixMs INTEGER NOT NULL, NextAttemptAtUnixMs INTEGER NOT NULL, SentAtUnixMs INTEGER NULL, LastError TEXT NOT NULL DEFAULT '');");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_BaleMessageQueue_Status_NextAttemptAtUnixMs_CreatedAtUnixMs ON BaleMessageQueue (Status, NextAttemptAtUnixMs, CreatedAtUnixMs);");
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

public static class BaleMessageText
{
    private static string Clip(string? value, int length)
    {
        var clean = string.Join(" ", (value ?? "").Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return clean.Length <= length ? clean : clean[..length] + "…";
    }

    private static string Date(DateOnly? date, string? jalali)
    {
        if (!date.HasValue) return "تعیین نشده";
        return string.IsNullOrWhiteSpace(jalali) ? JalaliDate.FromGregorian(date.Value).Replace('.', '/') : jalali.Replace('.', '/');
    }

    private static string Greeting(string recipientName, string? recipientTitle)
    {
        var name = Clip(string.IsNullOrWhiteSpace(recipientName) ? "کاربر" : recipientName, 80);
        var title = (recipientTitle ?? "").Trim();
        if (string.IsNullOrWhiteSpace(title)) return name + " گرامی، سلام؛";

        if (!title.Contains("محترم", StringComparison.Ordinal))
        {
            var firstSpace = title.IndexOf(' ');
            title = firstSpace > 0 ? title[..firstSpace] + " محترم" + title[firstSpace..] : title + " محترم";
        }

        return title + " (" + name + ") سلام،";
    }
    public static string WithResolutionTag(string text, string? number)
    {
        var tagNumber = System.Text.RegularExpressions.Regex.Replace((number ?? "").Trim(), @"[^\p{L}\p{N}_-]+", "_").Trim('_');
        if (tagNumber.Length == 0) return text;
        var tag = "#مصوبه_" + tagNumber;
        return text.Contains(tag, StringComparison.Ordinal) ? text : text.TrimEnd() + "\n" + tag;
    }

    public static string WithDetectedResolutionTags(string text)
    {
        var matches = System.Text.RegularExpressions.Regex.Matches(text, @"مصوبه\s+(?:شماره\s*)?([\p{Nd}]+(?:[/._-][\p{Nd}]+)*)");
        var numbers = matches.Cast<System.Text.RegularExpressions.Match>().Select(match => match.Groups[1].Value).Distinct(StringComparer.Ordinal).ToList();
        foreach (var number in numbers)
            text = WithResolutionTag(text, number);
        return text;
    }

    public static string ForAssignment(Resolution item, string recipientName, string? recipientTitle = null)
    {
        var text = Clip(item.Text, 500);
        var notes = Clip(item.Notes, 260);
        var message = "📬 وظیفهٔ جدید از دفتر وزارتی\n"
            + Greeting(recipientName, recipientTitle) + " یک مصوبه برای پیگیری به شما ارجاع شده است.\n"
            + "🔢 شماره مصوبه: " + item.Number + "\n"
            + "📝 موضوع: " + text + "\n"
            + "📅 تاریخ جلسه: " + Date(item.MeetingDate, item.MeetingDateJalali) + "\n"
            + "🚀 شروع پیگیری: " + Date(item.StartDate, item.StartDateJalali) + "\n"
            + "⏰ مهلت اقدام: " + Date(item.DueDate, item.DueDateJalali)
            + (string.IsNullOrWhiteSpace(notes) ? "" : "\nℹ️ توضیحات: " + notes)
            + "\nلطفاً در سامانه «پیگیری مصوبات» جزئیات را بررسی و وضعیت یا گزارش اقدام خود را ثبت کنید.";
        return WithResolutionTag(message, item.Number);
    }


    public static string ForWarning(Resolution item, string recipientName, string status, string? recipientTitle = null)
    {
        var text = Clip(item.Text, 420);
        var notes = Clip(item.Notes, 180);
        var message = "🚨 یادآوری پیگیری از دفتر وزارتی\n"
            + Greeting(recipientName, recipientTitle) + "\n"
            + "برای وظیفهٔ شما در این مصوبه، وضعیت «" + status + "» ثبت شده است.\n"
            + "🔢 شماره مصوبه: " + item.Number + "\n"
            + "📝 موضوع: " + text + "\n"
            + "📅 تاریخ جلسه: " + Date(item.MeetingDate, item.MeetingDateJalali) + "\n"
            + "🚀 شروع پیگیری: " + Date(item.StartDate, item.StartDateJalali) + "\n"
            + "⏳ مهلت اقدام: " + Date(item.DueDate, item.DueDateJalali)
            + (string.IsNullOrWhiteSpace(notes) ? "" : "\nℹ️ توضیحات: " + notes)
            + "\nلطفاً جزئیات را در سامانه «پیگیری مصوبات» بررسی کنید و گزارش اقدام یا وضعیت جدید را ثبت کنید.";
        return WithResolutionTag(message, item.Number);
    }


    public static string ForOverdueWarnings(string recipientName, IEnumerable<Resolution> items, string nationalId, string? recipientTitle = null)
    {
        var resolutions = items.Take(8).ToList();
        var details = resolutions.Select(item =>
        {
            var status = item.Progress.FirstOrDefault(progress => progress.NationalId == nationalId)?.Status ?? item.Status;
            var label = status == "delayed" ? "دارای تأخیر" : "در حال اجرا";
            var detail = "• مصوبه " + item.Number + " | " + label + " | سررسید: " + Date(item.DueDate, item.DueDateJalali)
                + " | " + Clip(item.Text, 150);
            return WithResolutionTag(detail, item.Number);
        });
        var total = items.Count();
        var extra = total > resolutions.Count ? "\nو " + (total - resolutions.Count) + " مصوبهٔ دیگر." : "";
        return "⏰ یادآوری مهلت از دفتر وزارتی\n"
            + Greeting(recipientName, recipientTitle) + "\n"
            + "برای پیگیری‌های زیر، مهلت اقدام گذشته است:\n"
            + string.Join("\n", details) + extra
            + "\nلطفاً در سامانه «پیگیری مصوبات» وضعیت را بررسی و اقدام یا گزارش خود را ثبت کنید.";
    }

}

public sealed record BaleDeliveryResult(bool Sent, string Reason);

public sealed class MessageDispatcher(IHttpClientFactory clients, IConfiguration configuration, ILogger<MessageDispatcher> logger)
{
    private readonly SemaphoreSlim _tokenLock = new(1, 1);
    private string? _cachedToken;
    private DateTimeOffset _tokenExpiresAt;

    public async Task<bool> SendAsync(string mobile, string text, CancellationToken cancellationToken = default)
        => (await SendWithResultAsync(mobile, text, cancellationToken)).Sent;

    public async Task<BaleDeliveryResult> SendWithResultAsync(string mobile, string text, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(mobile))
            return new BaleDeliveryResult(false, "شمارهٔ موبایل گیرنده ثبت نشده است.");

        try
        {
            var tokenResult = await GetTokenAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(tokenResult.Token))
                return new BaleDeliveryResult(false, tokenResult.Error ?? "دریافت توکن از سرویس بله ناموفق بود.");

            var url = configuration["BALE_SEND_URL"] ?? configuration["Bale:SendUrl"] ?? "http://192.168.0.96:5800/api/BaleMessenger/sendMessage";
            using var request = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(
                    System.Text.Json.JsonSerializer.Serialize(new[] { new { phone = mobile, Message = text, SendType = 1 } }),
                    System.Text.Encoding.UTF8,
                    "application/json")
            };
            request.Headers.TryAddWithoutValidation("token", tokenResult.Token);
            using var response = await clients.CreateClient("MessageApi").SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var reason = $"سرویس ارسال بله با کد HTTP {(int)response.StatusCode} پاسخ داد.";
                logger.LogWarning("Bale messaging API returned HTTP {StatusCode} ({ReasonPhrase}).", (int)response.StatusCode, response.ReasonPhrase);
                return new BaleDeliveryResult(false, reason);
            }
            return new BaleDeliveryResult(true, "");
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (OperationCanceledException exception)
        {
            logger.LogWarning(exception, "Bale messaging request timed out.");
            return new BaleDeliveryResult(false, "مهلت پاسخ‌گویی سرویس بله تمام شد.");
        }
        catch (HttpRequestException exception)
        {
            logger.LogWarning(exception, "Could not connect to Bale messaging service.");
            return new BaleDeliveryResult(false, "ارتباط با سرویس بله برقرار نشد؛ جزئیات در لاگ سرور ثبت شده است.");
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Bale messaging request failed.");
            return new BaleDeliveryResult(false, "ارسال پیام از سرویس بله با خطای داخلی مواجه شد؛ جزئیات در لاگ سرور ثبت شده است.");
        }
    }

    private async Task<(string? Token, string? Error)> GetTokenAsync(CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(_cachedToken) && _tokenExpiresAt > DateTimeOffset.UtcNow)
            return (_cachedToken, null);
        await _tokenLock.WaitAsync(cancellationToken);
        try
        {
            if (!string.IsNullOrWhiteSpace(_cachedToken) && _tokenExpiresAt > DateTimeOffset.UtcNow)
                return (_cachedToken, null);
            var username = configuration["BALE_USERNAME"] ?? configuration["Bale:Username"];
            var password = configuration["BALE_PASSWORD"] ?? configuration["Bale:Password"];
            if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            {
                logger.LogWarning("Bale credentials are not configured.");
                return (null, "نام کاربری یا گذرواژهٔ بله در تنظیمات سرور وارد نشده است.");
            }
            var tokenUrl = configuration["BALE_TOKEN_URL"] ?? configuration["Bale:TokenUrl"] ?? "http://192.168.0.96:5800/user/login/GetToken";
            using var form = new MultipartFormDataContent();
            form.Add(new StringContent(username, System.Text.Encoding.UTF8), "username");
            form.Add(new StringContent(password, System.Text.Encoding.UTF8), "password");
            using var request = new HttpRequestMessage(HttpMethod.Post, tokenUrl)
            {
                Content = form
            };
            using var response = await clients.CreateClient("MessageApi").SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var upstreamMessage = SafeUpstreamMessage(body, username, password);
                logger.LogWarning("Bale token API returned HTTP {StatusCode} ({ReasonPhrase}). Provider detail: {ProviderDetail}",
                    (int)response.StatusCode, response.ReasonPhrase, upstreamMessage);
                var detail = string.IsNullOrWhiteSpace(upstreamMessage) ? "" : " توضیح سرویس: " + upstreamMessage;
                return (null, $"دریافت توکن از سرویس بله با کد HTTP {(int)response.StatusCode} ناموفق بود.{detail}");
            }
            _cachedToken = ExtractToken(body);
            if (string.IsNullOrWhiteSpace(_cachedToken))
            {
                logger.LogWarning("Bale token API response did not contain a recognized token.");
                return (null, "پاسخ سرویس دریافت توکن بله معتبر نیست یا توکن در آن پیدا نشد.");
            }
            _tokenExpiresAt = DateTimeOffset.UtcNow.AddMinutes(20);
            return (_cachedToken, null);
        }
        finally { _tokenLock.Release(); }
    }

    private static string SafeUpstreamMessage(string responseBody, string? username, string? password)
    {
        var message = "";
        try
        {
            using var document = System.Text.Json.JsonDocument.Parse(responseBody);
            message = FindMessage(document.RootElement) ?? "";
        }
        catch (System.Text.Json.JsonException)
        {
            var plain = responseBody.Trim();
            if (!plain.StartsWith("<", StringComparison.Ordinal))
                message = plain;
        }

        if (!string.IsNullOrWhiteSpace(username)) message = message.Replace(username, "[مخفی]", StringComparison.OrdinalIgnoreCase);
        if (!string.IsNullOrWhiteSpace(password)) message = message.Replace(password, "[مخفی]", StringComparison.Ordinal);
        var cleanedMessage = new string(message.Where(character => !char.IsControl(character) || char.IsWhiteSpace(character)).ToArray());
        message = string.Join(" ", cleanedMessage.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return message.Length > 240 ? message[..240] : message;
    }

    private static string? FindMessage(System.Text.Json.JsonElement element)
    {
        if (element.ValueKind == System.Text.Json.JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
            {
                if (property.Name.Equals("message", StringComparison.OrdinalIgnoreCase)
                    || property.Name.Equals("error", StringComparison.OrdinalIgnoreCase)
                    || property.Name.Equals("detail", StringComparison.OrdinalIgnoreCase)
                    || property.Name.Equals("title", StringComparison.OrdinalIgnoreCase))
                {
                    if (property.Value.ValueKind == System.Text.Json.JsonValueKind.String)
                        return property.Value.GetString();
                }
            }
            foreach (var property in element.EnumerateObject())
            {
                var nested = FindMessage(property.Value);
                if (!string.IsNullOrWhiteSpace(nested)) return nested;
            }
        }
        else if (element.ValueKind == System.Text.Json.JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
            {
                var nested = FindMessage(item);
                if (!string.IsNullOrWhiteSpace(nested)) return nested;
            }
        }
        else if (element.ValueKind == System.Text.Json.JsonValueKind.String)
        {
            return element.GetString();
        }
        return null;
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

public sealed class BaleMessageQueueService(IServiceScopeFactory scopeFactory, ILogger<BaleMessageQueueService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDb>();
        var sender = scope.ServiceProvider.GetRequiredService<MessageDispatcher>();

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                var batch = await db.BaleMessageQueue
                    .Where(message => (message.Status == "pending" || message.Status == "processing") && message.NextAttemptAtUnixMs <= now)
                    .OrderBy(message => message.NextAttemptAtUnixMs)
                    .ThenBy(message => message.CreatedAtUnixMs)
                    .Take(5)
                    .ToListAsync(stoppingToken);

                if (batch.Count == 0)
                {
                    await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
                    continue;
                }

                foreach (var message in batch)
                {
                    message.Status = "processing";
                    message.NextAttemptAtUnixMs = now + (5 * 60 * 1000);
                }
                await db.SaveChangesAsync(stoppingToken);

                // Always resolve the current directory mobile immediately before delivery.
                var recipientIds = batch.Select(message => message.NationalId).Distinct().ToList();
                var currentMobiles = await db.Users.AsNoTracking()
                    .Where(user => recipientIds.Contains(user.NationalId))
                    .ToDictionaryAsync(user => user.NationalId, user => user.Mobile, stoppingToken);
                foreach (var message in batch)
                {
                    var currentMobile = currentMobiles.GetValueOrDefault(message.NationalId, "");
                    if (!string.IsNullOrWhiteSpace(currentMobile))
                        message.Mobile = currentMobile;
                    else
                    {
                        message.Status = "failed";
                        message.LastError = "شماره موبایل گیرنده در فهرست کاربران ثبت نشده است.";
                    }
                }
                await db.SaveChangesAsync(stoppingToken);
                var deliverableBatch = batch.Where(message => message.Status == "processing").ToList();
                var deliveries = await Task.WhenAll(deliverableBatch.Select(async message =>
                    (Message: message, Result: await sender.SendWithResultAsync(message.Mobile, message.Text, stoppingToken))));

                foreach (var (message, result) in deliveries)
                {
                    message.Attempts++;
                    if (result.Sent)
                    {
                        message.Status = "sent";
                        message.SentAtUnixMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                        message.LastError = "";
                    }
                    else
                    {
                        message.LastError = result.Reason.Length <= 500 ? result.Reason : result.Reason[..500];
                        if (message.Attempts >= 8)
                        {
                            message.Status = "failed";
                            logger.LogError("Bale message {QueueId} to {NationalId} failed after {Attempts} attempts: {Reason}",
                                message.Id, message.NationalId, message.Attempts, message.LastError);
                        }
                        else
                        {
                            message.Status = "pending";
                            var retrySeconds = Math.Min(1800, 20 * (1 << Math.Min(message.Attempts, 6)));
                            message.NextAttemptAtUnixMs = DateTimeOffset.UtcNow.AddSeconds(retrySeconds).ToUnixTimeMilliseconds();
                        }
                    }
                }
                await db.SaveChangesAsync(stoppingToken);
                db.ChangeTracker.Clear();
                await Task.Delay(TimeSpan.FromMilliseconds(300), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                db.ChangeTracker.Clear();
                logger.LogError(exception, "Bale message queue processing failed.");
                try { await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken); }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            }
        }
    }
}
