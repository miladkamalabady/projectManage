using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.StaticFiles;
using Vezarati.Api.Models;

var builder = WebApplication.CreateBuilder(args);
const long maxAttachmentSize = 50L * 1024 * 1024;
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = maxAttachmentSize);
builder.Services.Configure<FormOptions>(options => options.MultipartBodyLengthLimit = maxAttachmentSize);
builder.Services.AddDbContext<AppDb>(options => options.UseSqlite(builder.Configuration.GetConnectionString("Default") ?? "Data Source=data/vezarati.db"));
builder.Services.AddScoped<NationalIdLookup, LocalNationalIdLookup>();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy.WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod()));
var app = builder.Build();
app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    Directory.CreateDirectory("data");
    await db.Database.EnsureCreatedAsync();
    await SchemaCompatibility.UpgradeAsync(db);
    await SeedData.Initialize(db, scope.ServiceProvider.GetRequiredService<IWebHostEnvironment>());
}

app.MapGet("/api/dashboard", async (string? userId, HttpRequest request, AppDb db) =>
{
    var id = userId ?? request.Headers["X-User-Id"].FirstOrDefault() ?? "admin";
    var groups = await db.Groups.Include(g => g.Members).ToListAsync();
    var records = await db.Resolutions.Include(r => r.Assignments).Include(r => r.Progress).Include(r => r.Attachments).Include(r => r.Events).Include(r => r.GroupAssignments).ThenInclude(a => a.Group).OrderByDescending(r => r.MeetingDate).ToListAsync();
    if (id != "admin") foreach (var resolution in records) resolution.Attachments.RemoveAll(attachment => !attachment.ApprovedForAll);
    var groupIds = groups.Where(g => g.Members.Any(m => m.NationalId == id)).Select(g => g.Id).ToHashSet();
    var mine = id == "admin" ? records : records.Where(r => r.PublishToAll || (r.GroupId.HasValue && groupIds.Contains(r.GroupId.Value)) || r.GroupAssignments.Any(a => groupIds.Contains(a.GroupId)) || r.Assignments.Any(a => a.NationalId == id)).ToList();
    object? currentUser;
    if (id == "admin")
    {
        var admin = await db.Users.FirstOrDefaultAsync(u => u.NationalId == id);
        currentUser = new { nationalId = id, displayName = admin?.DisplayName ?? "مدیر دفتر وزارتی", role = admin?.Role ?? "ادمین" };
    }
    else
    {
        var person = await db.Directory.AsNoTracking().FirstOrDefaultAsync(u => u.NationalId == id);
        var titles = groups.SelectMany(g => g.Members).Where(m => m.NationalId == id && !string.IsNullOrWhiteSpace(m.Title)).Select(m => m.Title).Distinct().ToList();
        var role = titles.Count > 0 ? string.Join("، ", titles) : person?.Title ?? "کاربر";
        currentUser = person is null ? null : new { nationalId = person.NationalId, displayName = person.DisplayName, role };
    }
    return Results.Ok(new { currentUser, groups, resolutions = mine });
});

app.MapGet("/api/resolutions", async (string? userId, AppDb db) =>
{
    var id = userId ?? "admin";
    var records = await db.Resolutions.Include(r => r.Assignments).Include(r => r.Progress).Include(r => r.Attachments).Include(r => r.Events).Include(r => r.GroupAssignments).ThenInclude(a => a.Group).OrderByDescending(r => r.MeetingDate).ToListAsync();
    if (id != "admin") foreach (var resolution in records) resolution.Attachments.RemoveAll(attachment => !attachment.ApprovedForAll);
    return Results.Ok(records);
});
app.MapPost("/api/resolutions", async (ResolutionCreate request, AppDb db, HttpRequest http) =>
{
    if (string.IsNullOrWhiteSpace(request.Number) || string.IsNullOrWhiteSpace(request.Text)) return Results.BadRequest(new { error = "شماره و متن مصوبه الزامی است." });
    if (request.GroupId.HasValue && !await db.Groups.AnyAsync(g => g.Id == request.GroupId)) return Results.BadRequest(new { error = "گروه انتخاب‌شده پیدا نشد." });
    if (!ResolutionStatuses.All.Contains(request.Status)) return Results.BadRequest(new { error = "وضعیت نامعتبر است." });
    var record = new Resolution { PublishToAll = request.PublishToAll, MeetingDate = request.MeetingDate, MeetingDateJalali = string.IsNullOrWhiteSpace(request.MeetingDateJalali) ? JalaliDate.FromGregorian(request.MeetingDate) : request.MeetingDateJalali, Number = request.Number.Trim(), Text = request.Text.Trim(), Notes = request.Notes?.Trim() ?? "", Status = request.Status, GroupId = request.GroupId, CreatedAt = DateTimeOffset.UtcNow, CreatedBy = http.Headers["X-User-Name"].FirstOrDefault() ?? "ادمین" };
    if (request.GroupIds is not null) foreach (var groupId in request.GroupIds.Distinct()) { if (!await db.Groups.AnyAsync(g => g.Id == groupId)) return Results.BadRequest(new { error = "گروه انتخاب‌شده پیدا نشد." }); record.GroupAssignments.Add(new ResolutionGroupAssignment { GroupId = groupId }); }
    foreach (var id in request.People.Distinct()) record.Assignments.Add(new ResolutionAssignment { NationalId = id });
    db.Resolutions.Add(record); await db.SaveChangesAsync();
    return Results.Created($"/api/resolutions/{record.Id}", record);
});
app.MapPut("/api/resolutions/{id:int}", async (int id, ResolutionCreate request, AppDb db) =>
{
    if (string.IsNullOrWhiteSpace(request.Number) || string.IsNullOrWhiteSpace(request.Text)) return Results.BadRequest(new { error = "شماره و متن مصوبه الزامی است." });
    if (!ResolutionStatuses.All.Contains(request.Status)) return Results.BadRequest(new { error = "وضعیت نامعتبر است." });
    var record = await db.Resolutions.Include(r => r.Assignments).Include(r => r.GroupAssignments).FirstOrDefaultAsync(r => r.Id == id);
    if (record is null) return Results.NotFound();
    var groupIds = (request.GroupIds ?? (request.GroupId.HasValue ? [request.GroupId.Value] : [])).Distinct().ToList();
    if (groupIds.Any(groupId => !db.Groups.Any(g => g.Id == groupId))) return Results.BadRequest(new { error = "گروه انتخاب‌شده پیدا نشد." });
    record.MeetingDate = request.MeetingDate;
    record.PublishToAll = request.PublishToAll;
    record.MeetingDateJalali = string.IsNullOrWhiteSpace(request.MeetingDateJalali) ? JalaliDate.FromGregorian(request.MeetingDate) : request.MeetingDateJalali;
    record.Number = request.Number.Trim(); record.Text = request.Text.Trim(); record.Notes = request.Notes?.Trim() ?? "";
    record.Status = request.Status; record.GroupId = request.GroupId; record.UpdatedAt = DateTimeOffset.UtcNow;
    db.ResolutionGroups.RemoveRange(record.GroupAssignments);
    foreach (var groupId in groupIds) record.GroupAssignments.Add(new ResolutionGroupAssignment { ResolutionId = id, GroupId = groupId });
    db.Assignments.RemoveRange(record.Assignments);
    foreach (var personId in request.People.Distinct()) record.Assignments.Add(new ResolutionAssignment { ResolutionId = id, NationalId = personId });
    await db.SaveChangesAsync(); return Results.Ok(record);
});
app.MapDelete("/api/resolutions/{id:int}", async (int id, AppDb db) =>
{
    var record = await db.Resolutions.FindAsync(id); if (record is null) return Results.NotFound();
    db.Resolutions.Remove(record); await db.SaveChangesAsync(); return Results.NoContent();
});
app.MapPatch("/api/resolutions/{id:int}/status", async (int id, ResolutionStatusUpdate request, AppDb db) =>
{
    if (!ResolutionStatuses.All.Contains(request.Status)) return Results.BadRequest(new { error = "وضعیت نامعتبر است." });
    var record = await db.Resolutions.Include(r => r.Progress).FirstOrDefaultAsync(r => r.Id == id);
    if (record is null) return Results.NotFound();
    var nationalId = request.NationalId?.Trim();
    if (!string.IsNullOrWhiteSpace(nationalId) && nationalId != "admin")
    {
        var directAssignment = await db.Assignments.AnyAsync(a => a.ResolutionId == id && a.NationalId == nationalId);
        var groupAssignment = await db.GroupMembers.AnyAsync(m => m.NationalId == nationalId &&
            ((record.GroupId.HasValue && m.GroupId == record.GroupId.Value) ||
             db.ResolutionGroups.Any(rg => rg.ResolutionId == id && rg.GroupId == m.GroupId)));
        if (!directAssignment && !groupAssignment && !record.PublishToAll) return Results.StatusCode(StatusCodes.Status403Forbidden);
        var progress = record.Progress.FirstOrDefault(p => p.NationalId == nationalId);
        if (progress is null)
        {
            progress = new ResolutionProgress { ResolutionId = id, NationalId = nationalId };
            record.Progress.Add(progress);
        }
        progress.Status = request.Status;
        progress.Notes = request.Notes?.Trim() ?? progress.Notes;
        progress.UpdatedAt = DateTimeOffset.UtcNow;
        record.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        return Results.Ok(progress);
    }
    record.Status = request.Status;
    record.Notes = request.Notes ?? record.Notes;
    record.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok(record);
});



app.MapPost("/api/resolutions/{id:int}/events", async (int id, ResolutionEventCreate request, AppDb db) =>
{
    var text = request.Text?.Trim() ?? "";
    var nationalId = request.NationalId?.Trim() ?? "";
    if (text.Length == 0) return Results.BadRequest(new { error = "شرح رویداد را وارد کنید." });
    if (text.Length > 2000) return Results.BadRequest(new { error = "شرح رویداد حداکثر ۲۰۰۰ نویسه باشد." });
    if (string.IsNullOrWhiteSpace(nationalId)) return Results.BadRequest(new { error = "شناسه کاربر ارسال نشده است." });
    var resolution = await db.Resolutions.FirstOrDefaultAsync(r => r.Id == id);
    if (resolution is null) return Results.NotFound();
    if (nationalId != "admin")
    {
        var direct = await db.Assignments.AnyAsync(a => a.ResolutionId == id && a.NationalId == nationalId);
        var inGroup = await db.GroupMembers.AnyAsync(m => m.NationalId == nationalId &&
            ((resolution.GroupId.HasValue && m.GroupId == resolution.GroupId.Value) ||
             db.ResolutionGroups.Any(rg => rg.ResolutionId == id && rg.GroupId == m.GroupId)));
        if (!direct && !inGroup && !resolution.PublishToAll) return Results.StatusCode(StatusCodes.Status403Forbidden);
    }
    var directoryUser = await db.Directory.AsNoTracking().FirstOrDefaultAsync(user => user.NationalId == nationalId);
    var member = await db.GroupMembers.AsNoTracking().FirstOrDefaultAsync(user => user.NationalId == nationalId);
    var eventEntry = new ResolutionEvent
    {
        ResolutionId = id, NationalId = nationalId,
        UserName = directoryUser?.DisplayName ?? member?.DisplayName ?? request.UserName?.Trim() ?? nationalId,
        Text = text, CreatedAt = DateTimeOffset.UtcNow
    };
    db.Events.Add(eventEntry);
    await db.SaveChangesAsync();
    return Results.Created($"/api/resolutions/{id}/events/{eventEntry.Id}", eventEntry);
});

app.MapPost("/api/resolutions/{id:int}/attachments", async (int id, HttpRequest request, AppDb db, IWebHostEnvironment environment) =>
{
    var form = await request.ReadFormAsync();
    var file = form.Files.GetFile("file");
    var nationalId = form["nationalId"].ToString().Trim();
    var uploaderName = form["uploaderName"].ToString().Trim();
    if (file is null || file.Length == 0) return Results.BadRequest(new { error = "فایل انتخاب‌شده خالی است." });
    if (file.Length > maxAttachmentSize) return Results.BadRequest(new { error = "حداکثر حجم هر فایل ۵۰ مگابایت است." });
    var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
    if (!AttachmentFileTypes.Allowed.Contains(extension)) return Results.BadRequest(new { error = "نوع فایل مجاز نیست." });
    var resolution = await db.Resolutions.Include(r => r.GroupAssignments).FirstOrDefaultAsync(r => r.Id == id);
    if (resolution is null) return Results.NotFound();
    if (string.IsNullOrWhiteSpace(nationalId)) return Results.BadRequest(new { error = "شناسه کاربر ارسال نشده است." });
    if (nationalId != "admin")
    {
        var direct = await db.Assignments.AnyAsync(a => a.ResolutionId == id && a.NationalId == nationalId);
        var inGroup = await db.GroupMembers.AnyAsync(m => m.NationalId == nationalId &&
            ((resolution.GroupId.HasValue && m.GroupId == resolution.GroupId.Value) ||
             db.ResolutionGroups.Any(rg => rg.ResolutionId == id && rg.GroupId == m.GroupId)));
        if (!direct && !inGroup && !resolution.PublishToAll) return Results.StatusCode(StatusCodes.Status403Forbidden);
    }
    var storedName = $"{Guid.NewGuid():N}{extension}";
    var uploadDirectory = Path.Combine(environment.ContentRootPath, "data", "uploads");
    Directory.CreateDirectory(uploadDirectory);
    var destination = Path.Combine(uploadDirectory, storedName);
    await using (var output = System.IO.File.Create(destination)) await file.CopyToAsync(output);
    var provider = new FileExtensionContentTypeProvider();
    if (!provider.TryGetContentType(file.FileName, out var contentType)) contentType = "application/octet-stream";
    var directoryPerson = await db.Directory.AsNoTracking().FirstOrDefaultAsync(person => person.NationalId == nationalId);
    var memberPerson = await db.GroupMembers.AsNoTracking().FirstOrDefaultAsync(person => person.NationalId == nationalId);
    var resolvedUploaderName = directoryPerson?.DisplayName ?? memberPerson?.DisplayName ?? uploaderName;

    var attachment = new ResolutionAttachment
    {
        ResolutionId = id, OriginalName = Path.GetFileName(file.FileName), StoredName = storedName,
        ContentType = contentType, Size = file.Length, UploadedBy = nationalId, UploaderName = string.IsNullOrWhiteSpace(resolvedUploaderName) ? nationalId : resolvedUploaderName, UploadedAt = DateTimeOffset.UtcNow
    };
    db.Attachments.Add(attachment);
    try { await db.SaveChangesAsync(); }
    catch { System.IO.File.Delete(destination); throw; }
    return Results.Created($"/api/attachments/{attachment.Id}", new { attachment.Id, attachment.OriginalName, attachment.ContentType, attachment.Size, attachment.UploadedBy, attachment.UploaderName, attachment.ApprovedForAll, attachment.UploadedAt });
});

app.MapGet("/api/attachments/{id:int}", async (int id, string nationalId, AppDb db, IWebHostEnvironment environment) =>
{
    var attachment = await db.Attachments.AsNoTracking().Include(a => a.Resolution).FirstOrDefaultAsync(a => a.Id == id);
    if (attachment is null) return Results.NotFound();
    if (nationalId != "admin" && !attachment.ApprovedForAll) return Results.StatusCode(StatusCodes.Status403Forbidden);
    var path = Path.Combine(environment.ContentRootPath, "data", "uploads", attachment.StoredName);
    if (!System.IO.File.Exists(path)) return Results.NotFound();
    return Results.File(path, attachment.ContentType, attachment.OriginalName, enableRangeProcessing: true);
});


app.MapPatch("/api/attachments/{id:int}/approval", async (int id, AttachmentApprovalRequest request, AppDb db) =>
{
    if (request.NationalId != "admin") return Results.StatusCode(StatusCodes.Status403Forbidden);
    var attachment = await db.Attachments.FirstOrDefaultAsync(item => item.Id == id);
    if (attachment is null) return Results.NotFound();
    attachment.ApprovedForAll = request.ApprovedForAll;
    await db.SaveChangesAsync();
    return Results.Ok(new { attachment.Id, attachment.ApprovedForAll });
});

app.MapGet("/api/groups", async (AppDb db) => Results.Ok(await db.Groups.Include(g => g.Members).OrderBy(g => g.Name).ToListAsync()));
app.MapPost("/api/groups", async (GroupCreate request, AppDb db) =>
{
    var name = request.Name.Trim(); if (name.Length == 0) return Results.BadRequest(new { error = "نام گروه الزامی است." });
    if (await db.Groups.AnyAsync(g => g.Name == name)) return Results.Conflict(new { error = "این گروه قبلاً تعریف شده است." });
    var group = new ResolutionGroup { Name = name }; db.Groups.Add(group); await db.SaveChangesAsync();
    return Results.Created($"/api/groups/{group.Id}", group);
});
app.MapGet("/api/users/search", async (string? q, AppDb db) =>
{
    var term = (q ?? "").Trim();
    if (term.Length < 2) return Results.Ok(Array.Empty<object>());
    static string Normalize(string value) => value
        .Replace("ي", "ی").Replace("ك", "ک").Replace("‌", " ")
        .Trim().ToLowerInvariant();
    var normalized = Normalize(term);
    var digits = new string(term.Where(char.IsDigit).ToArray());
    var groupTitles = await db.GroupMembers.AsNoTracking()
        .Where(member => !string.IsNullOrWhiteSpace(member.Title))
        .GroupBy(member => member.NationalId)
        .Select(group => new { NationalId = group.Key, Title = group.Select(member => member.Title).First() })
        .ToDictionaryAsync(item => item.NationalId, item => item.Title);
    var directory = await db.Directory.AsNoTracking().ToListAsync();
    var people = directory
        .Where(person => Normalize(person.DisplayName).Contains(normalized) ||
            (digits.Length >= 2 && person.NationalId.Contains(digits)))
        .OrderBy(person => person.DisplayName)
        .Take(30)
        .Select(person => new { person.NationalId, person.DisplayName, Title = !string.IsNullOrWhiteSpace(person.Title) ? person.Title : groupTitles.GetValueOrDefault(person.NationalId, "") })
        .ToList();
    return Results.Ok(people);
});
app.MapPost("/api/groups/{id:int}/members/lookup", async (int id, MemberLookupRequest request, AppDb db, NationalIdLookup lookup) =>
{
    var group = await db.Groups.Include(g => g.Members).FirstOrDefaultAsync(g => g.Id == id); if (group is null) return Results.NotFound();
    var person = await lookup.FindAsync(request.NationalId); if (person is null) return Results.NotFound(new { error = "کاربری با این کد ملی در فهرست کاربران پیدا نشد." });
    if (group.Members.All(m => m.NationalId != person.NationalId)) group.Members.Add(new GroupMember { NationalId = person.NationalId, DisplayName = person.DisplayName, Title = request.Title?.Trim() ?? "" });
    await db.SaveChangesAsync(); return Results.Ok(group);
});
app.MapDelete("/api/groups/{id:int}/members/{nationalId}", async (int id, string nationalId, AppDb db) =>
{
    var member = await db.GroupMembers.FirstOrDefaultAsync(m => m.GroupId == id && m.NationalId == nationalId); if (member is null) return Results.NotFound();
    db.GroupMembers.Remove(member); await db.SaveChangesAsync(); return Results.NoContent();
});
app.MapPost("/api/users", async (CreateDirectoryPerson request, AppDb db) =>
{
    var nationalId = NormalizeDigits(request.NationalId.Trim());
    var firstName = request.FirstName.Trim();
    var lastName = request.LastName.Trim();
    var title = request.Title?.Trim() ?? "";
    if (nationalId.Length is < 8 or > 11 || !nationalId.All(char.IsDigit))
        return Results.BadRequest(new { error = "کد ملی باید بین ۸ تا ۱۱ رقم باشد." });
    if (string.IsNullOrWhiteSpace(firstName) || string.IsNullOrWhiteSpace(lastName))
        return Results.BadRequest(new { error = "نام و نام خانوادگی الزامی است." });
    var existing = await db.Directory.FirstOrDefaultAsync(person => person.NationalId == nationalId);
    if (existing is not null)
        return Results.Conflict(new { error = "این کد ملی قبلاً در فهرست اشخاص ثبت شده است." });
    var person = new DirectoryUser { NationalId = nationalId, DisplayName = $"{firstName} {lastName}", Title = title };
    db.Directory.Add(person);
    await db.SaveChangesAsync();
    return Results.Created($"/api/users/{person.NationalId}", new { person.NationalId, person.DisplayName, person.Title });
});
static string NormalizeDigits(string value)
{
    var persian = "۰۱۲۳۴۵۶۷۸۹"; var arabic = "٠١٢٣٤٥٦٧٨٩";
    return new string(value.Select(character =>
    {
        var index = persian.IndexOf(character); if (index >= 0) return (char)('0' + index);
        index = arabic.IndexOf(character); if (index >= 0) return (char)('0' + index);
        return character;
    }).ToArray());
}
app.MapGet("/api/users", async (AppDb db) =>
{
    var directory = await db.Directory.AsNoTracking().OrderBy(u => u.DisplayName).ToListAsync();
    var titlesByUser = await db.GroupMembers.AsNoTracking().Where(member => !string.IsNullOrWhiteSpace(member.Title))
        .GroupBy(member => member.NationalId)
        .Select(group => new { NationalId = group.Key, Title = group.Select(member => member.Title).First() })
        .ToDictionaryAsync(item => item.NationalId, item => item.Title);
    return Results.Ok(directory.Select(user => new
    {
        user.NationalId,
        user.DisplayName,
        Title = titlesByUser.GetValueOrDefault(user.NationalId, user.Title),
        Province = titlesByUser.GetValueOrDefault(user.NationalId, user.Title).Contains("مدیر کل", StringComparison.OrdinalIgnoreCase)
            ? ExtractProvince(titlesByUser.GetValueOrDefault(user.NationalId, user.Title))
            : null
    }));
});
app.MapGet("/api/reports", async (AppDb db) =>
{
    var records = await db.Resolutions.Include(r => r.Assignments).Include(r => r.Progress).Include(r => r.Group).ThenInclude(g => g!.Members).Include(r => r.GroupAssignments).ThenInclude(a => a.Group).ThenInclude(g => g!.Members).ToListAsync();
    var directory = await db.Directory.ToDictionaryAsync(u => u.NationalId, u => (DisplayName: u.DisplayName, Title: u.Title));
    var rows = records.SelectMany(r => (r.Group?.Members.Select(m => (NationalId: m.NationalId, DisplayName: m.DisplayName, Title: m.Title)) ?? Enumerable.Empty<(string NationalId, string DisplayName, string Title)>())
        .Concat(r.GroupAssignments.SelectMany(a => a.Group!.Members.Select(m => (NationalId: m.NationalId, DisplayName: m.DisplayName, Title: m.Title))))
        .Concat(r.Assignments.Select(a => (NationalId: a.NationalId, DisplayName: directory.GetValueOrDefault(a.NationalId, (DisplayName: a.NationalId, Title: "")).DisplayName, Title: directory.GetValueOrDefault(a.NationalId, (DisplayName: a.NationalId, Title: "")).Title)))
        .DistinctBy(p => p.NationalId)
        .Select(p => new { p.NationalId, p.DisplayName, p.Title, Status = r.Progress.FirstOrDefault(progress => progress.NationalId == p.NationalId)?.Status ?? r.Status }))
        .GroupBy(x => new { x.NationalId, x.DisplayName, x.Title })
        .Select(g => new { g.Key.NationalId, g.Key.DisplayName, g.Key.Title, Total = g.Count(), Completed = g.Count(x => x.Status == "completed"), Delayed = g.Count(x => x.Status == "delayed"), Pending = g.Count(x => x.Status is "before" or "in_progress") })
        .OrderByDescending(x => x.Total).ToList();
    return Results.Ok(new { total = records.Count, completed = records.Count(r => r.Status == "completed"), delayed = records.Count(r => r.Status == "delayed"), pending = records.Count(r => r.Status is "before" or "in_progress"), people = rows });
});
static string? ExtractProvince(string title)
{
    var clean = title.Trim();
    foreach (var prefix in new[] { "مدیر کل", "مدیرکل" })
        if (clean.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            return clean[prefix.Length..].Trim(' ', '،', '-', 'ـ');
    return null;
}

app.MapFallbackToFile("index.html");
app.Run();

record ResolutionCreate(DateOnly MeetingDate, string? MeetingDateJalali, string Number, string Text, string? Notes, string Status, int? GroupId, List<int>? GroupIds, List<string> People, bool PublishToAll);
record ResolutionStatusUpdate(string Status, string? Notes, string? NationalId);
record GroupCreate(string Name);
record ResolutionEventCreate(string Text, string NationalId, string? UserName);
record AttachmentApprovalRequest(string NationalId, bool ApprovedForAll);
record MemberLookupRequest(string NationalId, string? Title);
static class ResolutionStatuses { public static readonly string[] All = ["before", "in_progress", "completed", "delayed"]; }
static class AttachmentFileTypes
{
    public static readonly HashSet<string> Allowed = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".rtf", ".odt", ".ods", ".odp",
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff",
        ".zip", ".rar", ".7z", ".tar", ".gz",
        ".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac",
        ".mp4", ".mov", ".avi", ".mkv", ".webm"
    };
}

record CreateDirectoryPerson(string NationalId, string FirstName, string LastName, string? Title);