using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using System.Security.Claims;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.AspNetCore.StaticFiles;
using Vezarati.Api.Models;

var builder = WebApplication.CreateBuilder(args);
const long maxAttachmentSize = 50L * 1024 * 1024;
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = maxAttachmentSize);
builder.Services.Configure<FormOptions>(options => options.MultipartBodyLengthLimit = maxAttachmentSize);
builder.Services.AddDbContext<AppDb>(options => options.UseSqlite(builder.Configuration.GetConnectionString("Default") ?? "Data Source=data/vezarati.db"));
builder.Services.AddScoped<NationalIdLookup, LocalNationalIdLookup>();
builder.Services.AddScoped<MessageDispatcher>();
builder.Services.AddHostedService<ResolutionStatusRefreshService>();
builder.Services.AddHostedService<BaleMessageQueueService>();
builder.Services.AddHttpClient("MessageApi", client => client.Timeout = TimeSpan.FromSeconds(15));
builder.Services.AddHttpClient("MeduSso", client => client.Timeout = TimeSpan.FromSeconds(60)).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(options =>
{
    options.Cookie.Name = "vezarati.auth";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
    options.ExpireTimeSpan = TimeSpan.FromHours(8);
    options.SlidingExpiration = true;
    options.Events.OnRedirectToLogin = context => { context.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; };
});
builder.Services.AddAuthorization();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy.WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod()));
var app = builder.Build();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        var path = context.Request.Path.Value ?? "";
        var isSso = path.Equals("/api/auth/sso", StringComparison.OrdinalIgnoreCase);
        var isMe = path.Equals("/api/auth/me", StringComparison.OrdinalIgnoreCase);
        var isLogout = path.Equals("/api/auth/logout", StringComparison.OrdinalIgnoreCase);
        if (!isSso && !isMe && !isLogout && context.User.Identity?.IsAuthenticated != true)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }
        var adminOnly =
            (path.Equals("/api/groups", StringComparison.OrdinalIgnoreCase) && HttpMethods.IsPost(context.Request.Method))
            || (path.StartsWith("/api/groups/", StringComparison.OrdinalIgnoreCase) && (HttpMethods.IsPost(context.Request.Method) || HttpMethods.IsDelete(context.Request.Method)))
            || (path.Equals("/api/attachments", StringComparison.OrdinalIgnoreCase) == false && path.StartsWith("/api/attachments/", StringComparison.OrdinalIgnoreCase) && path.EndsWith("/approval", StringComparison.OrdinalIgnoreCase) && HttpMethods.IsPatch(context.Request.Method))
            || (path.Equals("/api/users", StringComparison.OrdinalIgnoreCase) && (HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsPost(context.Request.Method)))
            || (path.StartsWith("/api/users/", StringComparison.OrdinalIgnoreCase) && HttpMethods.IsPatch(context.Request.Method))
            || path.Equals("/api/users/search", StringComparison.OrdinalIgnoreCase)
            || (path.Equals("/api/settings/bale-notifications", StringComparison.OrdinalIgnoreCase) && (HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsPut(context.Request.Method)))
            || path.Equals("/api/reports", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/api/reports/submissions", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/api/reports/bale-messages", StringComparison.OrdinalIgnoreCase)
            || (path.Equals("/api/reports/warnings", StringComparison.OrdinalIgnoreCase) && HttpMethods.IsPost(context.Request.Method))
            || (path.StartsWith("/api/reports/warnings/", StringComparison.OrdinalIgnoreCase) && HttpMethods.IsPost(context.Request.Method))
            || (path.StartsWith("/api/resolutions/", StringComparison.OrdinalIgnoreCase) && path.EndsWith("/warnings", StringComparison.OrdinalIgnoreCase) && HttpMethods.IsPost(context.Request.Method))
            || (path.StartsWith("/api/resolutions", StringComparison.OrdinalIgnoreCase) &&
                ((path.Equals("/api/resolutions", StringComparison.OrdinalIgnoreCase) && (HttpMethods.IsPost(context.Request.Method) || HttpMethods.IsDelete(context.Request.Method)))
                 || (path.StartsWith("/api/resolutions/", StringComparison.OrdinalIgnoreCase) &&
                    (HttpMethods.IsPut(context.Request.Method) || HttpMethods.IsDelete(context.Request.Method)
                     || path.EndsWith("/completion-review", StringComparison.OrdinalIgnoreCase)
                     || path.EndsWith("/archive", StringComparison.OrdinalIgnoreCase)
                     || path.EndsWith("/attachments/approval", StringComparison.OrdinalIgnoreCase)))));

        if (adminOnly && !context.User.IsInRole("ادمین"))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }
    }
    await next();
});
app.UseDefaultFiles();
app.UseStaticFiles();
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    Directory.CreateDirectory("data");
    await db.Database.EnsureCreatedAsync();
    await SchemaCompatibility.UpgradeAsync(db);
    await SeedData.Initialize(db, scope.ServiceProvider.GetRequiredService<IWebHostEnvironment>());
    await db.Database.ExecuteSqlRawAsync("UPDATE Resolutions SET StartDate = MeetingDate, StartDateJalali = MeetingDateJalali WHERE StartDate IS NULL;");
}

const string primaryAdminNationalId = "0534921973";

app.MapPost("/api/auth/sso", async (SsoLoginRequest request, HttpContext context, AppDb db, IHttpClientFactory clients, IConfiguration configuration, ILogger<Program> logger) =>
{
    var code = request.Code?.Trim();
    if (string.IsNullOrWhiteSpace(code) || code.Length > 4096) return Results.BadRequest(new { error = "کد ورود نامعتبر است." });
    var authorization = configuration["SSO:Authorization"];
    if (string.IsNullOrWhiteSpace(authorization)) return Results.Problem("تنظیم اتصال SSO روی سرور انجام نشده است.", statusCode: StatusCodes.Status503ServiceUnavailable);
    try
    {
        var currentUri = new Uri(configuration["SSO:UserInfoUrl"] ?? "https://my.medu.ir/api/sso/UserInfo");
        using var client = clients.CreateClient("MeduSso");
        HttpResponseMessage? pendingResponse = null;
        for (var redirectCount = 0; redirectCount <= 5; redirectCount++)
        {
            using var message = new HttpRequestMessage(HttpMethod.Post, currentUri);
            message.Content = new ByteArrayContent(Array.Empty<byte>());
            message.Headers.Accept.ParseAdd("*/*");
            message.Headers.TryAddWithoutValidation("code", code);
            message.Headers.Authorization = AuthenticationHeaderValue.Parse(authorization);
            pendingResponse = await client.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, context.RequestAborted);
            var location = pendingResponse.Headers.Location;
            var isRedirect = pendingResponse.StatusCode is System.Net.HttpStatusCode.MovedPermanently
                or System.Net.HttpStatusCode.Redirect
                or System.Net.HttpStatusCode.SeeOther
                or System.Net.HttpStatusCode.TemporaryRedirect
                or System.Net.HttpStatusCode.PermanentRedirect;
            if (!isRedirect || location is null) break;
            if (redirectCount == 5)
            {
                pendingResponse.Dispose();
                return Results.Json(new { error = "سرویس SSO تعداد redirect بیش از حد مجاز برگرداند." }, statusCode: StatusCodes.Status502BadGateway);
            }
            var nextUri = location.IsAbsoluteUri ? location : new Uri(currentUri, location);
            var sameHost = string.Equals(currentUri.Host, nextUri.Host, StringComparison.OrdinalIgnoreCase);
            var safeSchemeChange = currentUri.Scheme == nextUri.Scheme ||
                (currentUri.Scheme == Uri.UriSchemeHttp && nextUri.Scheme == Uri.UriSchemeHttps);
            if (!sameHost || !safeSchemeChange || nextUri.UserInfo.Length > 0)
            {
                pendingResponse.Dispose();
                return Results.Json(new { error = "سرویس SSO به نشانی ناامن یا میزبان دیگری redirect داد؛ اعتبارنامه ارسال نشد." }, statusCode: StatusCodes.Status502BadGateway);
            }
            pendingResponse.Dispose();
            pendingResponse = null;
            currentUri = nextUri;
        }
        if (pendingResponse is null) return Results.Json(new { error = "پاسخی از سرویس SSO دریافت نشد." }, statusCode: StatusCodes.Status502BadGateway);
        using var response = pendingResponse;
        var upstreamPayload = await response.Content.ReadAsByteArrayAsync(context.RequestAborted);
        var upstreamContentType = response.Content.Headers.ContentType?.ToString();
        if (!response.IsSuccessStatusCode)
        {
            logger.LogWarning("Medu SSO returned HTTP {UpstreamStatus}.", (int)response.StatusCode);
            return Results.StatusCode(StatusCodes.Status401Unauthorized);
        }
        using var json = JsonDocument.Parse(upstreamPayload);
        var root = json.RootElement;
        var codeResult = 0;
        var hasResultCode = root.TryGetProperty("resultCode", out var resultCode) && resultCode.TryGetInt32(out codeResult);
        if (hasResultCode && codeResult != 200)
        {
            logger.LogWarning("Medu SSO rejected the code with resultCode {ResultCode}.", codeResult);
            return Results.StatusCode(StatusCodes.Status401Unauthorized);
        }
        var data = root;
        var hasNestedData = root.TryGetProperty("data", out var nestedData) && nestedData.ValueKind == JsonValueKind.Object;
        if (hasNestedData)
            data = nestedData;
        var hasStatus = root.TryGetProperty("status", out var statusValue) && statusValue.ValueKind == JsonValueKind.True;
        var isSuccessful = hasStatus || (hasResultCode && codeResult == 200 && hasNestedData && nestedData.TryGetProperty("nationalID", out _));
        if (!isSuccessful)
            logger.LogWarning("Medu SSO response did not match a supported success shape (has status: {HasStatus}, nested data: {HasNestedData}).", root.TryGetProperty("status", out _), hasNestedData);
        string ReadString(string key) => data.TryGetProperty(key, out var value) && value.ValueKind != JsonValueKind.Null ? value.ToString() : "";
        int? ReadInt(string key) => data.TryGetProperty(key, out var value) && value.TryGetInt32(out var number) ? number : null;
        var nationalId = ReadString("nationalID").Trim();
        if (!isSuccessful || nationalId.Length is < 8 or > 11 || !nationalId.All(char.IsDigit))
            return Results.StatusCode(StatusCodes.Status401Unauthorized);
        var firstName = ReadString("firstName").Trim();
        var lastName = ReadString("lastName").Trim();
        if (nationalId.Length is < 8 or > 11 || !nationalId.All(char.IsDigit) || firstName.Length + lastName.Length == 0) return Results.StatusCode(StatusCodes.Status401Unauthorized);
        var displayName = string.Join(" ", new[] { firstName, lastName }.Where(value => value.Length > 0));
        var position = ReadString("orgPositionDesc");
        var user = await db.Users.FirstOrDefaultAsync(item => item.NationalId == nationalId, context.RequestAborted);
        var role = nationalId == primaryAdminNationalId ? "ادمین" : user?.Role == "ادمین" ? "ادمین" : "کاربر";
        if (user is null) { user = new AppUser { NationalId = nationalId }; db.Users.Add(user); }
        user.DisplayName = displayName;
        user.Role = role;
        user.FirstName = firstName;
        user.LastName = lastName;
        user.Father = ReadString("father");
        user.Gender = ReadInt("gender");
        user.BirthDate = ReadString("birthDate");
        user.PersianBirthDate = ReadString("persianBirthDate");
        if (!user.MobileOverriddenByAdmin) user.Mobile = ReadString("mobile");
        user.UserType = ReadInt("userType");
        user.PersonnelCode = ReadString("personnelCode");
        user.OrgPositionCode = ReadString("orgPositionCode");
        user.OrgPositionDesc = position;
        user.OrgPositionTypeCode = ReadInt("orgPositionTypeCode");
        user.OrgPositionTypeDesc = ReadString("orgPositionTypeDesc");
        user.RegionId = ReadInt("regionId");
        user.LastLoginAt = DateTimeOffset.UtcNow;
        var directory = await db.Directory.FirstOrDefaultAsync(item => item.NationalId == nationalId, context.RequestAborted);
        if (directory is null) { directory = new DirectoryUser { NationalId = nationalId }; db.Directory.Add(directory); }
        directory.DisplayName = displayName;
        directory.Title = string.IsNullOrWhiteSpace(position) ? ReadString("orgPositionTypeDesc") : position;
        var memberships = await db.GroupMembers.Where(member => member.NationalId == nationalId).ToListAsync(context.RequestAborted);
        foreach (var member in memberships) { member.DisplayName = displayName; member.Title = directory.Title; }
        await db.SaveChangesAsync(context.RequestAborted);
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, nationalId), new Claim(ClaimTypes.Name, displayName),
            new Claim(ClaimTypes.Role, role), new Claim("title", directory.Title), new Claim("regionId", user.RegionId?.ToString() ?? "")
        };
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme));
        await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal, new AuthenticationProperties { IsPersistent = true, ExpiresUtc = DateTimeOffset.UtcNow.AddHours(8) });
        return Results.NoContent();
    }
    catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { return Results.NoContent(); }
    catch (OperationCanceledException exception)
    {
        logger.LogError(exception, "Medu SSO request timed out.");
        return Results.Problem("پاسخ سرویس SSO در زمان مجاز نرسید.", statusCode: StatusCodes.Status504GatewayTimeout);
    }
    catch (HttpRequestException exception)
    {
        logger.LogError(exception, "Could not connect to Medu SSO.");
        return Results.Problem("سرور به سرویس SSO دسترسی ندارد؛ اتصال شبکه و DNS سرور را بررسی کنید.", statusCode: StatusCodes.Status502BadGateway);
    }
    catch (JsonException exception)
    {
        logger.LogError(exception, "Medu SSO returned invalid JSON.");
        return Results.Problem("پاسخ سرویس SSO قابل‌خواندن نیست.", statusCode: StatusCodes.Status502BadGateway);
    }
    catch (Exception exception)
    {
        logger.LogError(exception, "Internal SSO login failure while saving the user or creating the session.");
        return Results.Problem("خطای داخلی هنگام ثبت کاربر یا ساخت نشست رخ داد؛ لاگ API را بررسی کنید.", statusCode: StatusCodes.Status500InternalServerError);
    }
});

app.MapGet("/api/auth/me", async (HttpContext context, AppDb db) =>
{
    var id = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (string.IsNullOrWhiteSpace(id)) return Results.Unauthorized();
    var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(item => item.NationalId == id);
    if (user is null) return Results.Unauthorized();
    if (!string.Equals(context.User.FindFirstValue(ClaimTypes.Role), user.Role, StringComparison.Ordinal))
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, id),
            new Claim(ClaimTypes.Name, user.DisplayName),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim("title", user.OrgPositionDesc),
            new Claim("regionId", user.RegionId?.ToString() ?? "")
        };
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme));
        await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal, new AuthenticationProperties { IsPersistent = true, ExpiresUtc = DateTimeOffset.UtcNow.AddHours(8) });
    }
    return Results.Ok(new { nationalId = id, displayName = user.DisplayName, role = user.Role, title = user.OrgPositionDesc, province = user.RegionId?.ToString() });
});
app.MapPost("/api/auth/logout", async (HttpContext context) =>
{
    await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.NoContent();
});

app.MapGet("/api/dashboard", async (HttpContext context, AppDb db) =>
{
    await ResolutionStatusUpdater.RefreshResolutionStatuses(db);
    var id = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    var isAdmin = context.User.IsInRole("ادمین");
    var groups = await db.Groups.Include(g => g.Members).ToListAsync();
    var records = await db.Resolutions.AsNoTracking().Where(item => !item.IsArchived).Include(r => r.Assignments).Include(r => r.Progress).Include(r => r.Attachments.Where(attachment => isAdmin || attachment.ApprovedForAll)).Include(r => r.Events).Include(r => r.GroupAssignments).ThenInclude(a => a.Group).OrderByDescending(r => r.MeetingDate).ToListAsync();
    var eventNames = await LoadPersonDisplayNames(db);
    foreach (var entry in records.SelectMany(resolution => resolution.Events)) entry.Text = NormalizeStatusEventText(entry, eventNames);
    if (!isAdmin) foreach (var resolution in records)
    {
        foreach (var progress in resolution.Progress.Where(progress => progress.NationalId != id)) { progress.ReportText = ""; progress.AdminFeedback = ""; progress.NationalId = ""; }
        foreach (var entry in resolution.Events) entry.NationalId = "";
        foreach (var assignment in resolution.Assignments) assignment.NationalId = "";
        foreach (var attachment in resolution.Attachments) attachment.UploadedBy = "";
    }
    var groupIds = groups.Where(g => g.Members.Any(m => m.NationalId == id)).Select(g => g.Id).ToHashSet();
    var mine = isAdmin ? records : records.Where(r => !r.IsArchived && r.Status != "cancelled" && (r.PublishToAll || (r.GroupId.HasValue && groupIds.Contains(r.GroupId.Value)) || r.GroupAssignments.Any(a => groupIds.Contains(a.GroupId)) || r.Assignments.Any(a => a.NationalId == id))).ToList();
    object? currentUser;
    if (isAdmin)
    {
        var admin = await db.Users.FirstOrDefaultAsync(u => u.NationalId == id);
        currentUser = new { nationalId = id, displayName = admin?.DisplayName ?? "مدیر دفتر وزارتی", role = admin?.Role ?? "کاربر" };
    }
    else
    {
        var person = await db.Directory.AsNoTracking().FirstOrDefaultAsync(u => u.NationalId == id);
        var titles = groups.SelectMany(g => g.Members).Where(m => m.NationalId == id && !string.IsNullOrWhiteSpace(m.Title)).Select(m => m.Title).Distinct().ToList();
        var role = titles.Count > 0 ? string.Join("، ", titles) : person?.Title ?? "کاربر";
        currentUser = person is null ? null : new { nationalId = person.NationalId, displayName = person.DisplayName, role };
    }
    return Results.Ok(new { currentUser, groups = isAdmin ? (object)groups : groups.Where(g => g.Members.Any(m => m.NationalId == id)).Select(g => new { g.Id, g.Name, g.Category, Members = g.Members.Where(m => m.NationalId == id).ToList() }), resolutions = mine });
});

app.MapGet("/api/resolutions", async (HttpContext context, AppDb db) =>
{
    await ResolutionStatusUpdater.RefreshResolutionStatuses(db);
    var id = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    var isAdmin = context.User.IsInRole("ادمین");
    var records = await db.Resolutions.AsNoTracking().Include(r => r.Assignments).Include(r => r.Progress).Include(r => r.Attachments.Where(attachment => isAdmin || attachment.ApprovedForAll)).Include(r => r.Events).Include(r => r.GroupAssignments).ThenInclude(a => a.Group).OrderByDescending(r => r.MeetingDate).ToListAsync();
    var eventNames = await LoadPersonDisplayNames(db);
    foreach (var entry in records.SelectMany(resolution => resolution.Events)) entry.Text = NormalizeStatusEventText(entry, eventNames);
    if (isAdmin) return Results.Ok(records);
    var groupIds = (await db.GroupMembers.Where(member => member.NationalId == id).Select(member => member.GroupId).ToListAsync()).ToHashSet();
    var mine = records.Where(r => !r.IsArchived && r.Status != "cancelled" && (r.PublishToAll || (r.GroupId.HasValue && groupIds.Contains(r.GroupId.Value)) || r.GroupAssignments.Any(a => groupIds.Contains(a.GroupId)) || r.Assignments.Any(a => a.NationalId == id))).ToList();
    foreach (var resolution in mine)
    {
        foreach (var progress in resolution.Progress.Where(progress => progress.NationalId != id)) { progress.ReportText = ""; progress.AdminFeedback = ""; progress.NationalId = ""; }
        foreach (var entry in resolution.Events) entry.NationalId = "";
        foreach (var assignment in resolution.Assignments) assignment.NationalId = "";
        foreach (var attachment in resolution.Attachments) attachment.UploadedBy = "";
    }
    return Results.Ok(mine);
});
app.MapPost("/api/resolutions", async (ResolutionCreate request, AppDb db, HttpContext http) =>
{
    if (string.IsNullOrWhiteSpace(request.Number) || string.IsNullOrWhiteSpace(request.Text)) return Results.BadRequest(new { error = "شماره و متن مصوبه الزامی است." });
    if (request.Status == "cancelled" && string.IsNullOrWhiteSpace(request.CancellationReason)) return Results.BadRequest(new { error = "برای لغو مصوبه، توضیحات لغو الزامی است." });
    if (request.RequiresPeriodicReport && !ResolutionStatuses.Frequencies.Contains(request.ReportFrequency ?? "")) return Results.BadRequest(new { error = "دوره دریافت گزارش را انتخاب کنید." });
    if (request.StartDate is null) return Results.BadRequest(new { error = "زمان شروع مصوبه الزامی است." });
    if (request.MeetingDate >= request.StartDate.Value) return Results.BadRequest(new { error = "تاریخ جلسه باید قبل از زمان شروع باشد." });
    if (request.DueDate.HasValue && request.DueDate.Value <= request.StartDate.Value) return Results.BadRequest(new { error = "زمان سررسید باید بعد از زمان شروع باشد." });
    if (request.GroupId.HasValue && !await db.Groups.AnyAsync(g => g.Id == request.GroupId)) return Results.BadRequest(new { error = "گروه انتخاب‌شده پیدا نشد." });
    if (!ResolutionStatuses.All.Contains(request.Status)) return Results.BadRequest(new { error = "وضعیت نامعتبر است." });
    var record = new Resolution { PublishToAll = request.PublishToAll, StartDate = request.StartDate, StartDateJalali = request.StartDate is null ? "" : (request.StartDateJalali ?? JalaliDate.FromGregorian(request.StartDate.Value)), DueDate = request.DueDate, DueDateJalali = request.DueDate is null ? "" : (request.DueDateJalali ?? JalaliDate.FromGregorian(request.DueDate.Value)), RequiresPeriodicReport = request.RequiresPeriodicReport, ReportFrequency = request.RequiresPeriodicReport ? request.ReportFrequency ?? "" : "", CancellationReason = request.CancellationReason?.Trim() ?? "", MeetingDate = request.MeetingDate, MeetingDateJalali = string.IsNullOrWhiteSpace(request.MeetingDateJalali) ? JalaliDate.FromGregorian(request.MeetingDate) : request.MeetingDateJalali, Number = request.Number.Trim(), Text = request.Text.Trim(), Notes = request.Notes?.Trim() ?? "", Status = ResolutionStatusUpdater.TimeBasedResolutionStatus(request.MeetingDate, request.StartDate.Value, request.DueDate, DateOnly.FromDateTime(DateTime.Today)), GroupId = request.GroupId, CreatedAt = DateTimeOffset.UtcNow, CreatedBy = http.User.Identity?.Name ?? "کاربر" };
    if (request.GroupIds is not null) foreach (var groupId in request.GroupIds.Distinct()) { if (!await db.Groups.AnyAsync(g => g.Id == groupId)) return Results.BadRequest(new { error = "گروه انتخاب‌شده پیدا نشد." }); record.GroupAssignments.Add(new ResolutionGroupAssignment { GroupId = groupId }); }
    foreach (var id in request.People.Distinct()) record.Assignments.Add(new ResolutionAssignment { NationalId = id });
    db.Resolutions.Add(record);
    await db.SaveChangesAsync();
    var recipientIds = request.People.Distinct().ToHashSet();
    var groupIdsToNotify = (request.GroupIds ?? (request.GroupId.HasValue ? [request.GroupId.Value] : [])).Distinct().ToHashSet();
    recipientIds.UnionWith(await db.GroupMembers.Where(member => groupIdsToNotify.Contains(member.GroupId)).Select(member => member.NationalId).ToListAsync());
    if (record.PublishToAll) recipientIds.UnionWith(await db.Directory.Select(person => person.NationalId).ToListAsync());
    var recipientIdList = recipientIds.ToList();
    var recipientProfiles = await db.Directory.AsNoTracking().Where(person => recipientIdList.Contains(person.NationalId)).ToListAsync();
    var recipientAccounts = await db.Users.AsNoTracking().Where(user => recipientIdList.Contains(user.NationalId)).ToListAsync();
    foreach (var recipient in recipientIds)
    {
        var profile = recipientProfiles.FirstOrDefault(person => person.NationalId == recipient);
        var account = recipientAccounts.FirstOrDefault(user => user.NationalId == recipient);
        var displayName = profile?.DisplayName ?? account?.DisplayName ?? "کاربر";
        var title = string.IsNullOrWhiteSpace(profile?.Title) ? account?.OrgPositionDesc : profile.Title;
        db.Notifications.Add(new UserNotification { NationalId = recipient, ResolutionId = record.Id, Type = "assigned", DateKey = record.Id.ToString(), Text = BaleMessageText.ForAssignment(record, displayName, title), CreatedAt = DateTimeOffset.UtcNow });
    }
    db.Events.Add(new ResolutionEvent { ResolutionId = record.Id, NationalId = primaryAdminNationalId, UserName = record.CreatedBy, Text = "مصوبه ثبت و برای پیگیری ارجاع شد.", CreatedAt = DateTimeOffset.UtcNow });
    await db.SaveChangesAsync();
    return Results.Created("/api/resolutions/" + record.Id, record);
});
app.MapPut("/api/resolutions/{id:int}", async (int id, ResolutionCreate request, AppDb db) =>
{
    if (string.IsNullOrWhiteSpace(request.Number) || string.IsNullOrWhiteSpace(request.Text)) return Results.BadRequest(new { error = "شماره و متن مصوبه الزامی است." });
    if (!ResolutionStatuses.All.Contains(request.Status)) return Results.BadRequest(new { error = "وضعیت نامعتبر است." });
    if (request.Status == "cancelled" && string.IsNullOrWhiteSpace(request.CancellationReason)) return Results.BadRequest(new { error = "برای لغو مصوبه، توضیحات لغو الزامی است." });
    if (request.RequiresPeriodicReport && !ResolutionStatuses.Frequencies.Contains(request.ReportFrequency ?? "")) return Results.BadRequest(new { error = "دوره دریافت گزارش را انتخاب کنید." });
    if (request.StartDate is null) return Results.BadRequest(new { error = "زمان شروع مصوبه الزامی است." });
    if (request.MeetingDate >= request.StartDate.Value) return Results.BadRequest(new { error = "تاریخ جلسه باید قبل از زمان شروع باشد." });
    if (request.DueDate.HasValue && request.DueDate.Value <= request.StartDate.Value) return Results.BadRequest(new { error = "زمان سررسید باید بعد از زمان شروع باشد." });
    var record = await db.Resolutions.Include(r => r.Assignments).Include(r => r.GroupAssignments).FirstOrDefaultAsync(r => r.Id == id);
    if (record is null) return Results.NotFound();
    var groupIds = (request.GroupIds ?? (request.GroupId.HasValue ? [request.GroupId.Value] : [])).Distinct().ToList();
    if (groupIds.Any(groupId => !db.Groups.Any(g => g.Id == groupId))) return Results.BadRequest(new { error = "گروه انتخاب‌شده پیدا نشد." });
    var priorRecipients = record.Assignments.Select(assignment => assignment.NationalId).ToHashSet();
    var priorGroupIds = record.GroupAssignments.Select(assignment => assignment.GroupId).ToList();
    priorRecipients.UnionWith(await db.GroupMembers.Where(member => priorGroupIds.Contains(member.GroupId)).Select(member => member.NationalId).ToListAsync());
    var wasPublic = record.PublishToAll;
    var scheduleChanged = record.MeetingDate != request.MeetingDate || record.StartDate != request.StartDate || record.DueDate != request.DueDate;
    record.MeetingDate = request.MeetingDate;
    record.StartDate = request.StartDate;
    record.StartDateJalali = request.StartDate is null ? "" : (request.StartDateJalali ?? JalaliDate.FromGregorian(request.StartDate.Value));
    record.DueDate = request.DueDate;
    record.DueDateJalali = request.DueDate is null ? "" : (request.DueDateJalali ?? JalaliDate.FromGregorian(request.DueDate.Value));
    record.RequiresPeriodicReport = request.RequiresPeriodicReport;
    record.ReportFrequency = request.RequiresPeriodicReport ? request.ReportFrequency ?? "" : "";
    record.CancellationReason = request.CancellationReason?.Trim() ?? "";
    record.PublishToAll = request.PublishToAll;
    record.MeetingDateJalali = string.IsNullOrWhiteSpace(request.MeetingDateJalali) ? JalaliDate.FromGregorian(request.MeetingDate) : request.MeetingDateJalali;
    record.Number = request.Number.Trim(); record.Text = request.Text.Trim(); record.Notes = request.Notes?.Trim() ?? "";
    if (scheduleChanged)
    {
        record.Status = ResolutionStatusUpdater.TimeBasedResolutionStatus(record.MeetingDate, request.StartDate.Value, request.DueDate, DateOnly.FromDateTime(DateTime.Today));
        record.CancellationReason = "";
    }
    else if (record.Status is not ("completed" or "cancelled"))
    {
        record.Status = ResolutionStatusUpdater.TimeBasedResolutionStatus(record.MeetingDate, request.StartDate.Value, request.DueDate, DateOnly.FromDateTime(DateTime.Today));
    }
    record.GroupId = request.GroupId; record.UpdatedAt = DateTimeOffset.UtcNow;
    db.ResolutionGroups.RemoveRange(record.GroupAssignments);
    foreach (var groupId in groupIds) record.GroupAssignments.Add(new ResolutionGroupAssignment { ResolutionId = id, GroupId = groupId });
    db.Assignments.RemoveRange(record.Assignments);
    foreach (var personId in request.People.Distinct()) record.Assignments.Add(new ResolutionAssignment { ResolutionId = id, NationalId = personId });
    await db.SaveChangesAsync();
    var newRecipients = request.People.Distinct().ToHashSet();
    newRecipients.UnionWith(await db.GroupMembers.Where(member => groupIds.Contains(member.GroupId)).Select(member => member.NationalId).ToListAsync());
    if (request.PublishToAll && !wasPublic) newRecipients.UnionWith(await db.Directory.Select(person => person.NationalId).ToListAsync());
    var newlyAssigned = newRecipients.Except(priorRecipients).ToList();
    var recipientProfiles = await db.Directory.AsNoTracking().Where(person => newlyAssigned.Contains(person.NationalId)).ToListAsync();
    var recipientAccounts = await db.Users.AsNoTracking().Where(user => newlyAssigned.Contains(user.NationalId)).ToListAsync();
    foreach (var recipient in newlyAssigned)
    {
        var profile = recipientProfiles.FirstOrDefault(person => person.NationalId == recipient);
        var account = recipientAccounts.FirstOrDefault(user => user.NationalId == recipient);
        var displayName = profile?.DisplayName ?? account?.DisplayName ?? "کاربر";
        var title = string.IsNullOrWhiteSpace(profile?.Title) ? account?.OrgPositionDesc : profile.Title;
        db.Notifications.Add(new UserNotification { NationalId = recipient, ResolutionId = id, Type = "assigned", DateKey = id + ":" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), Text = BaleMessageText.ForAssignment(record, displayName, title), CreatedAt = DateTimeOffset.UtcNow });
    }
    db.Events.Add(new ResolutionEvent { ResolutionId = id, NationalId = primaryAdminNationalId, UserName = "مدیر دفتر وزارتی", Text = "اطلاعات مصوبه، مهلت و ارجاع‌های آن ویرایش شد.", CreatedAt = DateTimeOffset.UtcNow });
    await db.SaveChangesAsync();
    await ResolutionStatusUpdater.RefreshResolutionStatuses(db);
    return Results.Ok(record);
});
app.MapDelete("/api/resolutions/{id:int}", async (int id, AppDb db) =>
{
    var record = await db.Resolutions.FindAsync(id); if (record is null) return Results.NotFound();
    db.Resolutions.Remove(record); await db.SaveChangesAsync(); return Results.NoContent();
});
app.MapPatch("/api/resolutions/{id:int}/status", async (int id, ResolutionStatusUpdate request, HttpContext context, AppDb db) =>
{
    var isAdmin = context.User.IsInRole("ادمین");
    var nationalId = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    var record = await db.Resolutions.Include(r => r.Progress).FirstOrDefaultAsync(r => r.Id == id);
    if (record is null) return Results.NotFound();
    if (record.Status == "cancelled") return Results.Conflict(new { error = "این مصوبه لغو شده و امکان تغییر وضعیت آن وجود ندارد." });

    var targetNationalId = isAdmin ? request.NationalId?.Trim() : nationalId;
    if (!isAdmin && !string.IsNullOrWhiteSpace(request.NationalId) && request.NationalId != nationalId)
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    if (!isAdmin && record.Progress.Any(item => item.NationalId == nationalId && item.Status == "rejected")) return Results.Conflict(new { error = "وضعیت شما برای این مصوبه رد شده و امکان اقدام ندارید." });

    if (!string.IsNullOrWhiteSpace(targetNationalId))
    {
        var assigned = await db.Assignments.AnyAsync(item => item.ResolutionId == id && item.NationalId == targetNationalId);
        var groupIds = await db.ResolutionGroups.Where(item => item.ResolutionId == id).Select(item => item.GroupId).ToListAsync();
        if (record.GroupId.HasValue) groupIds.Add(record.GroupId.Value);
        var inGroup = await db.GroupMembers.AnyAsync(member => member.NationalId == targetNationalId && groupIds.Contains(member.GroupId));
        if (!assigned && !inGroup && !record.PublishToAll) return Results.BadRequest(new { error = "این فرد به مصوبه ارجاع نشده است." });

        var allowedIndividualStatuses = isAdmin ? new[] { "completed", "rejected", "in_progress" } : new[] { "completed", "in_progress" };
        if (!allowedIndividualStatuses.Contains(request.Status)) return Results.BadRequest(new { error = isAdmin ? "وضعیت فرد باید اجرا شده، رد شده یا در حال اجرا باشد." : "وضعیت شما باید اجرا شده یا در حال اجرا باشد." });
        var progress = record.Progress.FirstOrDefault(item => item.NationalId == targetNationalId);
        if (progress is null) { progress = new ResolutionProgress { ResolutionId = id, NationalId = targetNationalId }; record.Progress.Add(progress); }
        progress.Status = request.Status;
        progress.Notes = request.Notes?.Trim() ?? progress.Notes;
        progress.UpdatedAt = DateTimeOffset.UtcNow;
        progress.ApprovalStatus = "none";
        if (request.Status != "completed") progress.AdminFeedback = "";
        var targetName = await db.Directory.Where(person => person.NationalId == targetNationalId).Select(person => person.DisplayName).FirstOrDefaultAsync()
            ?? await db.Users.Where(person => person.NationalId == targetNationalId).Select(person => person.DisplayName).FirstOrDefaultAsync()
            ?? await db.GroupMembers.Where(person => person.NationalId == targetNationalId).Select(person => person.DisplayName).FirstOrDefaultAsync()
            ?? "عضو مصوبه";
        var statusName = request.Status switch { "completed" => "اجرا شده", "rejected" => "رد شده", "in_progress" => "در حال اجرا", _ => request.Status };
        db.Events.Add(new ResolutionEvent
        {
            ResolutionId = id,
            NationalId = isAdmin ? primaryAdminNationalId : nationalId,
            UserName = isAdmin ? "مدیر دفتر وزارتی" : targetName,
            Text = "وضعیت پیگیری " + targetName + " به «" + statusName + "» تغییر کرد.",
            CreatedAt = DateTimeOffset.UtcNow
        });
        record.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        await ResolutionStatusUpdater.RefreshResolutionStatuses(db);
        return Results.Ok(progress);
    }

    if (!isAdmin) return Results.StatusCode(StatusCodes.Status403Forbidden);
    if (request.Status is not ("completed" or "cancelled")) return Results.BadRequest(new { error = "ادمین فقط می‌تواند وضعیت کلی را اجرا شده یا لغو شده کند." });
    if (request.Status == "cancelled" && string.IsNullOrWhiteSpace(request.Notes)) return Results.BadRequest(new { error = "برای لغو مصوبه، توضیحات لغو الزامی است." });
    record.Status = request.Status;
    if (request.Status == "cancelled") record.CancellationReason = request.Notes!.Trim();
    record.Notes = request.Notes ?? record.Notes;
    record.UpdatedAt = DateTimeOffset.UtcNow;
    db.Events.Add(new ResolutionEvent { ResolutionId = id, NationalId = primaryAdminNationalId, UserName = "مدیر دفتر وزارتی", Text = "وضعیت کلی مصوبه به «" + request.Status + "» تغییر کرد.", CreatedAt = DateTimeOffset.UtcNow });
    await db.SaveChangesAsync();
    return Results.Ok(record);
});
app.MapPatch("/api/resolutions/{id:int}/progress/bulk-status", async (int id, ResolutionBulkStatusUpdate request, HttpContext context, AppDb db) =>
{
    if (!context.User.IsInRole("ادمین")) return Results.StatusCode(StatusCodes.Status403Forbidden);
    if (request.Status is not ("completed" or "rejected" or "in_progress"))
        return Results.BadRequest(new { error = "وضعیت افراد باید اجرا شده، رد شده یا در حال اجرا باشد." });
    var resolution = await db.Resolutions.Include(item => item.Progress).Include(item => item.Assignments)
        .Include(item => item.GroupAssignments).FirstOrDefaultAsync(item => item.Id == id && !item.IsArchived);
    if (resolution is null) return Results.NotFound();
    if (resolution.Status == "cancelled") return Results.Conflict(new { error = "مصوبه لغو شده و امکان تغییر وضعیت افراد وجود ندارد." });

    var groupIds = resolution.GroupAssignments.Select(assignment => assignment.GroupId).ToHashSet();
    if (resolution.GroupId.HasValue) groupIds.Add(resolution.GroupId.Value);
    var nationalIds = resolution.Assignments.Select(assignment => assignment.NationalId).ToHashSet(StringComparer.Ordinal);
    nationalIds.UnionWith(await db.GroupMembers.Where(member => groupIds.Contains(member.GroupId)).Select(member => member.NationalId).ToListAsync());
    if (resolution.PublishToAll)
    {
        nationalIds.UnionWith(await db.Directory.Select(person => person.NationalId).ToListAsync());
        nationalIds.UnionWith(await db.Users.Select(user => user.NationalId).ToListAsync());
    }
    if (nationalIds.Count == 0) return Results.BadRequest(new { error = "برای این مصوبه فرد ارجاع‌شده‌ای پیدا نشد." });

    var names = await db.Directory.AsNoTracking().ToDictionaryAsync(person => person.NationalId, person => person.DisplayName);
    foreach (var person in await db.Users.AsNoTracking().ToListAsync())
        if (!string.IsNullOrWhiteSpace(person.DisplayName)) names[person.NationalId] = person.DisplayName;
    foreach (var person in await db.GroupMembers.AsNoTracking().ToListAsync())
        if (!string.IsNullOrWhiteSpace(person.DisplayName) && !names.ContainsKey(person.NationalId)) names[person.NationalId] = person.DisplayName;
    var statusName = request.Status switch { "completed" => "اجرا شده", "rejected" => "رد شده", "in_progress" => "در حال اجرا", _ => request.Status };
    foreach (var nationalId in nationalIds)
    {
        var progress = resolution.Progress.FirstOrDefault(item => item.NationalId == nationalId);
        if (progress is null)
        {
            progress = new ResolutionProgress { ResolutionId = id, NationalId = nationalId };
            resolution.Progress.Add(progress);
        }
        progress.Status = request.Status;
        if (!string.IsNullOrWhiteSpace(request.Notes)) progress.Notes = request.Notes.Trim();
        progress.ApprovalStatus = "none";
        if (request.Status != "completed") progress.AdminFeedback = "";
        progress.UpdatedAt = DateTimeOffset.UtcNow;
        db.Events.Add(new ResolutionEvent
        {
            ResolutionId = id,
            NationalId = primaryAdminNationalId,
            UserName = "مدیر دفتر وزارتی",
            Text = "وضعیت پیگیری " + names.GetValueOrDefault(nationalId, "عضو مصوبه") + " به «" + statusName + "» تغییر کرد.",
            CreatedAt = DateTimeOffset.UtcNow
        });
    }
    resolution.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    await ResolutionStatusUpdater.RefreshResolutionStatuses(db);
    return Results.Ok(new { updated = nationalIds.Count, status = request.Status });
});

app.MapPost("/api/resolutions/{id:int}/events", async (int id, ResolutionEventCreate request, HttpContext context, AppDb db) =>
{
    var text = request.Text?.Trim() ?? "";
    var nationalId = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    if (text.Length == 0) return Results.BadRequest(new { error = "شرح رویداد را وارد کنید." });
    if (text.Length > 2000) return Results.BadRequest(new { error = "شرح رویداد حداکثر ۲۰۰۰ نویسه باشد." });
    var resolution = await db.Resolutions.Include(r => r.Progress).FirstOrDefaultAsync(r => r.Id == id);
    if (resolution is null) return Results.NotFound();
    var isAdmin = context.User.IsInRole("ادمین");
    if (!isAdmin && resolution.Status == "cancelled") return Results.Conflict(new { error = "این مصوبه لغو شده است." });
    if (!isAdmin && resolution.Progress.Any(item => item.NationalId == nationalId && item.Status == "rejected")) return Results.Conflict(new { error = "وضعیت شما برای این مصوبه رد شده و امکان اقدام ندارید." });
    if (!isAdmin)
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
    if (!isAdmin)
        db.Notifications.Add(new UserNotification { NationalId = primaryAdminNationalId, ResolutionId = id, Type = "event", DateKey = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString(), Text = eventEntry.UserName + " رویداد جدیدی برای مصوبه " + resolution.Number + " ثبت کرد.", CreatedAt = DateTimeOffset.UtcNow });
    if (!isAdmin)
    {
        var progress = resolution.Progress.FirstOrDefault(item => item.NationalId == nationalId);
        if (progress is null) { progress = new ResolutionProgress { ResolutionId = id, NationalId = nationalId }; resolution.Progress.Add(progress); }
        if (progress.Status is not ("completed" or "rejected")) progress.Status = "in_progress";
        progress.UpdatedAt = DateTimeOffset.UtcNow;
    }
    await db.SaveChangesAsync();
    await ResolutionStatusUpdater.RefreshResolutionStatuses(db);
    return Results.Created($"/api/resolutions/{id}/events/{eventEntry.Id}", eventEntry);
});


app.MapPost("/api/resolutions/{id:int}/completion-report", async (int id, CompletionReportRequest request, HttpContext context, AppDb db) =>
{
    var nationalId = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    var text = request.Text.Trim();

    if (text.Length == 0) return Results.BadRequest(new { error = "شرح اقدام را وارد کنید." });
    var resolution = await db.Resolutions.Include(item => item.Progress).FirstOrDefaultAsync(item => item.Id == id);
    if (resolution is null || resolution.IsArchived) return Results.NotFound();
    if (resolution.Status == "cancelled") return Results.Conflict(new { error = "این مصوبه لغو شده است." });
    if (resolution.Progress.Any(item => item.NationalId == nationalId && item.Status == "rejected")) return Results.Conflict(new { error = "وضعیت شما برای این مصوبه رد شده و امکان اقدام ندارید." });
    var direct = await db.Assignments.AnyAsync(item => item.ResolutionId == id && item.NationalId == nationalId);
    var inGroup = await db.GroupMembers.AnyAsync(member => member.NationalId == nationalId &&
        ((resolution.GroupId.HasValue && member.GroupId == resolution.GroupId.Value) ||
         db.ResolutionGroups.Any(group => group.ResolutionId == id && group.GroupId == member.GroupId)));
    if (!direct && !inGroup && !resolution.PublishToAll) return Results.StatusCode(StatusCodes.Status403Forbidden);
    var progress = resolution.Progress.FirstOrDefault(item => item.NationalId == nationalId);
    if (progress is null) { progress = new ResolutionProgress { ResolutionId = id, NationalId = nationalId }; resolution.Progress.Add(progress); }
    progress.ReportText = text;
    progress.ApprovalStatus = "pending";
    progress.AdminFeedback = "";
    progress.UpdatedAt = DateTimeOffset.UtcNow;
    if (progress.Status != "completed") progress.Status = "in_progress";
    var personName = await db.Directory.Where(person => person.NationalId == nationalId).Select(person => person.DisplayName).FirstOrDefaultAsync() ?? request.UserName;
    var submittedAt = DateTimeOffset.UtcNow;
    db.ResolutionReports.Add(new ResolutionReport { ResolutionId = id, NationalId = nationalId, UserName = personName, Text = text, ReportType = "completion", PeriodKey = "completion:" + submittedAt.ToUnixTimeMilliseconds(), SubmittedAt = submittedAt });
    db.Events.Add(new ResolutionEvent { ResolutionId = id, NationalId = nationalId, UserName = personName, Text = "گزارش اقدام برای بررسی ادمین ارسال شد.", CreatedAt = DateTimeOffset.UtcNow });
    var notifyKey = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
    db.Notifications.Add(new UserNotification { NationalId = primaryAdminNationalId, ResolutionId = id, Type = "report", DateKey = id + ":" + notifyKey, Text = "گزارش اقدام جدید برای مصوبه " + resolution.Number + " ثبت شد.", CreatedAt = DateTimeOffset.UtcNow });
    await db.SaveChangesAsync();
    await ResolutionStatusUpdater.RefreshResolutionStatuses(db);
    return Results.Ok(progress);
});

app.MapPost("/api/resolutions/{id:int}/reports", async (int id, ResolutionSubmissionRequest request, HttpContext context, AppDb db) =>
{
    var nationalId = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    var resolution = await db.Resolutions.FirstOrDefaultAsync(item => item.Id == id && !item.IsArchived);
    if (resolution is null) return Results.NotFound();
    if (resolution.Status == "cancelled") return Results.Conflict(new { error = "این مصوبه لغو شده است." });
    if (await db.Progress.AnyAsync(item => item.ResolutionId == id && item.NationalId == nationalId && item.Status == "rejected")) return Results.Conflict(new { error = "وضعیت شما برای این مصوبه رد شده و امکان اقدام ندارید." });
    if (!resolution.RequiresPeriodicReport) return Results.BadRequest(new { error = "برای این مصوبه گزارش مستمر تعریف نشده است." });
    var direct = await db.Assignments.AnyAsync(item => item.ResolutionId == id && item.NationalId == nationalId);
    var inGroup = await db.GroupMembers.AnyAsync(member => member.NationalId == nationalId &&
        ((resolution.GroupId.HasValue && member.GroupId == resolution.GroupId.Value) ||
         db.ResolutionGroups.Any(group => group.ResolutionId == id && group.GroupId == member.GroupId)));
    if (!direct && !inGroup && !resolution.PublishToAll) return Results.StatusCode(StatusCodes.Status403Forbidden);
    var text = request.Text?.Trim() ?? "";
    if (text.Length == 0) return Results.BadRequest(new { error = "متن گزارش را وارد کنید." });
    if (text.Length > 5000) return Results.BadRequest(new { error = "متن گزارش حداکثر ۵۰۰۰ نویسه باشد." });
    var today = DateOnly.FromDateTime(DateTime.Today);
    var startDate = resolution.StartDate ?? resolution.MeetingDate;
    var duePeriods = BuildDueReportPeriods(startDate, resolution.ReportFrequency, today);
    if (duePeriods.Count == 0) return Results.BadRequest(new { error = "هنوز موعد نخستین گزارش این مصوبه نرسیده است." });
    var submittedPeriods = await db.ResolutionReports.Where(report => report.ResolutionId == id && report.NationalId == nationalId && report.ReportType == "periodic").Select(report => report.PeriodKey).ToListAsync();
    var period = duePeriods.FirstOrDefault(value => !submittedPeriods.Contains(value.Key));
    if (string.IsNullOrEmpty(period.Key)) return Results.Conflict(new { error = "گزارش این دوره قبلاً ثبت شده و موعد بعدی هنوز نرسیده است." });
    var personName = await db.Directory.Where(person => person.NationalId == nationalId).Select(person => person.DisplayName).FirstOrDefaultAsync() ?? context.User.Identity?.Name ?? nationalId;
    var submittedAt = DateTimeOffset.UtcNow;
    db.ResolutionReports.Add(new ResolutionReport { ResolutionId = id, NationalId = nationalId, UserName = personName, Text = text, ReportType = "periodic", PeriodKey = period.Key, SubmittedAt = submittedAt });
    db.Events.Add(new ResolutionEvent { ResolutionId = id, NationalId = nationalId, UserName = personName, Text = "گزارش دوره‌ای (" + period.Key + ") برای مصوبه " + resolution.Number + " ثبت شد.", CreatedAt = submittedAt });
    db.Notifications.Add(new UserNotification { NationalId = primaryAdminNationalId, ResolutionId = id, Type = "periodic-report", DateKey = id + ":" + submittedAt.ToUnixTimeMilliseconds(), Text = "گزارش دوره‌ای جدید از " + personName + " برای مصوبه " + resolution.Number + " ثبت شد.", CreatedAt = submittedAt });
    await db.SaveChangesAsync();
    await ResolutionStatusUpdater.RefreshResolutionStatuses(db);
    return Results.Ok(new { submitted = true, periodKey = period.Key, dueDate = period.DueDate });
});

app.MapGet("/api/reports/bale-messages", async (HttpContext context, AppDb db, string? q, string? status, string? from, string? to, int page = 1, int pageSize = 20) =>
{
    if (!context.User.IsInRole("ادمین")) return Results.Forbid();
    page = Math.Max(1, page);
    pageSize = Math.Clamp(pageSize, 1, 5000);
    var query = from message in db.BaleMessageQueue.AsNoTracking()
                join directory in db.Directory.AsNoTracking() on message.NationalId equals directory.NationalId into people
                from person in people.DefaultIfEmpty()
                select new { Message = message, DisplayName = person == null ? "کاربر حذف‌شده" : person.DisplayName };

    if (!string.IsNullOrWhiteSpace(status) && status != "all")
        query = query.Where(item => item.Message.Status == status);
    if (!string.IsNullOrWhiteSpace(q))
    {
        var search = q.Trim();
        query = query.Where(item => item.DisplayName.Contains(search)
            || item.Message.Mobile.Contains(search)
            || item.Message.Text.Contains(search)
            || item.Message.LastError.Contains(search));
    }
    if (DateOnly.TryParse(from, out var fromDate))
    {
        var fromUnixMs = new DateTimeOffset(fromDate.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(3.5)).ToUnixTimeMilliseconds();
        query = query.Where(item => item.Message.CreatedAtUnixMs >= fromUnixMs);
    }
    if (DateOnly.TryParse(to, out var toDate))
    {
        var toExclusiveUnixMs = new DateTimeOffset(toDate.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(3.5)).ToUnixTimeMilliseconds();
        query = query.Where(item => item.Message.CreatedAtUnixMs < toExclusiveUnixMs);
    }

    var total = await query.CountAsync(context.RequestAborted);
    var pageCount = Math.Max(1, (int)Math.Ceiling(total / (double)pageSize));
    page = Math.Min(page, pageCount);
    var rows = await query.OrderByDescending(item => item.Message.CreatedAtUnixMs)
        .Skip((page - 1) * pageSize).Take(pageSize)
        .Select(item => new
        {
            item.Message.Id,
            item.DisplayName,
            item.Message.Mobile,
            item.Message.Text,
            item.Message.Status,
            item.Message.Attempts,
            item.Message.CreatedAtUnixMs,
            item.Message.SentAtUnixMs,
            item.Message.LastError
        })
        .ToListAsync(context.RequestAborted);
    var items = rows.Select(item => new
    {
        item.Id,
        item.DisplayName,
        item.Mobile,
        item.Text,
        item.Status,
        item.Attempts,
        CreatedAt = DateTimeOffset.FromUnixTimeMilliseconds(item.CreatedAtUnixMs).ToString("O"),
        SentAt = item.SentAtUnixMs.HasValue ? DateTimeOffset.FromUnixTimeMilliseconds(item.SentAtUnixMs.Value).ToString("O") : null,
        item.LastError
    });
    return Results.Ok(new { total, page, pageSize, items });
});
app.MapGet("/api/reports/submissions", async (AppDb db) =>
{
    // SQLite cannot reliably translate ordering for DateTimeOffset; sort after materializing.
    var reports = (await db.ResolutionReports.Include(report => report.Resolution).ToListAsync())
        .OrderByDescending(report => report.SubmittedAt)
        .ToList();
    var directory = await db.Directory.AsNoTracking().ToDictionaryAsync(person => person.NationalId, person => (person.DisplayName, person.Title));
    var positions = await db.Users.AsNoTracking().ToDictionaryAsync(user => user.NationalId, user => user.OrgPositionDesc);
    return Results.Ok(reports.Select(report => new
    {
        report.Id,
        report.ResolutionId,
        ResolutionNumber = report.Resolution?.Number ?? "",
        ResolutionText = report.Resolution?.Text ?? "",
        report.NationalId,
        UserName = string.IsNullOrWhiteSpace(report.UserName) ? directory.GetValueOrDefault(report.NationalId, (DisplayName: report.NationalId, Title: "")).DisplayName : report.UserName,
        UserTitle = !string.IsNullOrWhiteSpace(positions.GetValueOrDefault(report.NationalId)) ? positions.GetValueOrDefault(report.NationalId) : directory.GetValueOrDefault(report.NationalId, (DisplayName: "", Title: "")).Title,
        report.Text,
        report.ReportType,
        report.PeriodKey,
        report.SubmittedAt,
        DueDate = report.ReportType == "periodic" ? report.PeriodKey.Split(':').LastOrDefault() : null
    }));
});

app.MapPatch("/api/resolutions/{id:int}/completion-review", async (int id, CompletionReviewRequest request, HttpContext context, AppDb db) =>
{
    var progress = await db.Progress.FirstOrDefaultAsync(item => item.ResolutionId == id && item.NationalId == request.AssigneeNationalId);
    if (progress is null || string.IsNullOrWhiteSpace(progress.ReportText)) return Results.NotFound();
    var resolution = await db.Resolutions.FindAsync(id);
    if (resolution is null) return Results.NotFound();
    progress.ApprovalStatus = request.Approved ? "approved" : "rejected";
    progress.AdminFeedback = request.Feedback?.Trim() ?? "";
    progress.UpdatedAt = DateTimeOffset.UtcNow;
    progress.Status = request.Approved ? "completed" : "in_progress";
    resolution.UpdatedAt = DateTimeOffset.UtcNow;
    var actionText = request.Approved ? "گزارش اقدام تأیید شد." : "گزارش اقدام برای اصلاح برگشت داده شد.";
    if (!string.IsNullOrWhiteSpace(progress.AdminFeedback)) actionText += " توضیح ادمین: " + progress.AdminFeedback;
    db.Events.Add(new ResolutionEvent { ResolutionId = id, NationalId = primaryAdminNationalId, UserName = "مدیر دفتر وزارتی", Text = actionText, CreatedAt = DateTimeOffset.UtcNow });
    db.Notifications.Add(new UserNotification { NationalId = progress.NationalId, ResolutionId = id, Type = request.Approved ? "report-approved" : "report-rejected", DateKey = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString(), Text = "گزارش اقدام شما برای مصوبه " + resolution.Number + (request.Approved ? " تأیید شد." : " نیاز به اصلاح دارد."), CreatedAt = DateTimeOffset.UtcNow });
    await db.SaveChangesAsync();
    return Results.Ok(progress);
});

app.MapPatch("/api/resolutions/{id:int}/archive", async (int id, ArchiveUpdateRequest request, HttpContext context, AppDb db) =>
{
    var resolution = await db.Resolutions.FindAsync(id);
    if (resolution is null) return Results.NotFound();
    resolution.IsArchived = request.IsArchived;
    resolution.UpdatedAt = DateTimeOffset.UtcNow;
    db.Events.Add(new ResolutionEvent { ResolutionId = id, NationalId = primaryAdminNationalId, UserName = "مدیر دفتر وزارتی", Text = request.IsArchived ? "مصوبه به بایگانی منتقل شد." : "مصوبه از بایگانی بازگردانده شد.", CreatedAt = DateTimeOffset.UtcNow });
    await db.SaveChangesAsync();
    return Results.Ok(resolution);
});

app.MapGet("/api/notifications", async (HttpContext context, AppDb db, ILogger<Program> logger) =>
{
    var nationalId = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(3.5));
    var groupIds = await db.GroupMembers.Where(member => member.NationalId == nationalId).Select(member => member.GroupId).ToListAsync();
    var dueRecords = await db.Resolutions.Where(item => !item.IsArchived && item.DueDate != null && item.DueDate <= today.AddDays(3) && item.Status != "completed")
        .Include(item => item.Assignments).Include(item => item.GroupAssignments).Include(item => item.Progress).ToListAsync();
    foreach (var item in dueRecords)
    {
        var personalProgress = item.Progress.FirstOrDefault(progress => progress.NationalId == nationalId);
        if (personalProgress?.Status == "completed") continue;
        var assigned = nationalId == primaryAdminNationalId ||
            (personalProgress is not null) ||
            item.Assignments.Any(assignment => assignment.NationalId == nationalId) ||
            groupIds.Contains(item.GroupId ?? -1) || item.GroupAssignments.Any(group => groupIds.Contains(group.GroupId)) ||
            item.PublishToAll;
        if (!assigned) continue;
        var overdue = item.DueDate!.Value < today;
        var type = overdue ? "overdue" : "deadline";
        var dateKey = overdue ? "overdue" : item.DueDate.Value.ToString("yyyy-MM-dd");
        if (!await db.Notifications.AnyAsync(notification => notification.NationalId == nationalId && notification.ResolutionId == item.Id && notification.Type == type && notification.DateKey == dateKey))
            db.Notifications.Add(new UserNotification { NationalId = nationalId, ResolutionId = item.Id, Type = type, DateKey = dateKey, Text = overdue ? "مهلت مصوبه " + item.Number + " گذشته است." : "مهلت مصوبه " + item.Number + " نزدیک است.", CreatedAt = DateTimeOffset.UtcNow });
    }
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException exception)
    {
        logger.LogInformation(exception, "A concurrent notification insert was ignored.");
        db.ChangeTracker.Clear();
    }
    var notifications = (await db.Notifications.Where(notification => notification.NationalId == nationalId).ToListAsync())
        .OrderByDescending(notification => notification.CreatedAt)
        .ThenByDescending(notification => notification.Id)
        .Take(100)
        .ToList();
    var resolutionIds = notifications.Where(notification => notification.ResolutionId.HasValue).Select(notification => notification.ResolutionId!.Value).Distinct().ToList();
    var numbers = await db.Resolutions.Where(item => resolutionIds.Contains(item.Id)).ToDictionaryAsync(item => item.Id, item => item.Number);
    return Results.Ok(notifications.Select(notification => new { notification.Id, notification.ResolutionId, ResolutionNumber = notification.ResolutionId.HasValue ? numbers.GetValueOrDefault(notification.ResolutionId.Value, "") : "", notification.Type, notification.Text, notification.IsRead, notification.CreatedAt }));
});

app.MapPatch("/api/notifications/{id:int}/read", async (int id, HttpContext context, AppDb db) =>
{
    var nationalId = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    var notification = await db.Notifications.FirstOrDefaultAsync(item => item.Id == id && item.NationalId == nationalId);
    if (notification is null) return Results.NotFound();
    notification.IsRead = true;
    await db.SaveChangesAsync();
    return Results.Ok(new { notification.Id, notification.IsRead });
});

app.MapPost("/api/resolutions/{id:int}/attachments", async (int id, HttpRequest request, HttpContext context, AppDb db, IWebHostEnvironment environment) =>
{
    var form = await request.ReadFormAsync();
    var file = form.Files.GetFile("file");
    var nationalId = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    var uploaderName = context.User.Identity?.Name ?? "کاربر";
    if (file is null || file.Length == 0) return Results.BadRequest(new { error = "فایل انتخاب‌شده خالی است." });
    if (file.Length > maxAttachmentSize) return Results.BadRequest(new { error = "حداکثر حجم هر فایل ۵۰ مگابایت است." });
    var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
    if (!AttachmentFileTypes.Allowed.Contains(extension)) return Results.BadRequest(new { error = "نوع فایل مجاز نیست." });
    var resolution = await db.Resolutions.Include(r => r.GroupAssignments).Include(r => r.Progress).FirstOrDefaultAsync(r => r.Id == id);
    if (resolution is null) return Results.NotFound();
    if (!context.User.IsInRole("ادمین") && resolution.Status == "cancelled") return Results.Conflict(new { error = "این مصوبه لغو شده است." });
    if (!context.User.IsInRole("ادمین") && resolution.Progress.Any(item => item.NationalId == nationalId && item.Status == "rejected")) return Results.Conflict(new { error = "وضعیت شما برای این مصوبه رد شده و امکان اقدام ندارید." });
    if (string.IsNullOrWhiteSpace(nationalId)) return Results.BadRequest(new { error = "شناسه کاربر ارسال نشده است." });
    if (!context.User.IsInRole("ادمین"))
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

app.MapGet("/api/attachments/{id:int}", async (int id, HttpContext context, AppDb db, IWebHostEnvironment environment) =>
{
    var attachment = await db.Attachments.AsNoTracking().Include(a => a.Resolution).FirstOrDefaultAsync(a => a.Id == id);
    if (attachment is null) return Results.NotFound();
    if (!context.User.IsInRole("ادمین") && !attachment.ApprovedForAll) return Results.StatusCode(StatusCodes.Status403Forbidden);
    var path = Path.Combine(environment.ContentRootPath, "data", "uploads", attachment.StoredName);
    if (!System.IO.File.Exists(path)) return Results.NotFound();
    return Results.File(path, attachment.ContentType, attachment.OriginalName, enableRangeProcessing: true);
});


app.MapPatch("/api/attachments/{id:int}/approval", async (int id, AttachmentApprovalRequest request, HttpContext context, AppDb db) =>
{
    var attachment = await db.Attachments.FirstOrDefaultAsync(item => item.Id == id);
    if (attachment is null) return Results.NotFound();
    attachment.ApprovedForAll = request.ApprovedForAll;
    await db.SaveChangesAsync();
    return Results.Ok(new { attachment.Id, attachment.ApprovedForAll });
});

app.MapGet("/api/groups", async (HttpContext context, AppDb db) =>
{
    var groups = await db.Groups.Include(group => group.Members).OrderBy(group => group.Name).ToListAsync();
    var currentId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
    var isAdmin = context.User.IsInRole("ادمین");
    var mobiles = await db.Users.AsNoTracking().ToDictionaryAsync(user => user.NationalId, user => user.Mobile);
    return Results.Ok(groups
        .Where(group => isAdmin || group.Members.Any(member => member.NationalId == currentId))
        .Select(group => new
        {
            group.Id,
            group.Name,
            group.Category,
            Members = group.Members
                .Where(member => isAdmin || member.NationalId == currentId)
                .Select(member => new
                {
                    member.Id,
                    member.NationalId,
                    member.DisplayName,
                    member.Title,
                    Mobile = mobiles.GetValueOrDefault(member.NationalId, "")
                })
                .ToList()
        }));
});
app.MapPut("/api/groups/{id:int}/category", async (int id, GroupCategoryRequest request, HttpContext context, AppDb db) =>
{
    if (!context.User.IsInRole("ادمین")) return Results.Forbid();
    if (request.Category is not ("group" or "unit")) return Results.BadRequest(new { error = "دسته‌بندی معتبر نیست." });
    var group = await db.Groups.FirstOrDefaultAsync(item => item.Id == id);
    if (group is null) return Results.NotFound(new { error = "گروه پیدا نشد." });
    group.Category = request.Category;
    await db.SaveChangesAsync();
    return Results.Ok(new { group.Id, group.Name, group.Category });
});
app.MapDelete("/api/groups/{id:int}", async (int id, AppDb db) =>
{
    var group = await db.Groups.Include(g => g.Members).FirstOrDefaultAsync(g => g.Id == id);
    if (group is null) return Results.NotFound(new { error = "گروه پیدا نشد." });
    if (group.Members.Count != 0) return Results.Conflict(new { error = "برای حذف گروه، ابتدا همه اعضای آن را حذف کنید." });
    var references = await db.Resolutions.AsNoTracking()
        .Include(item => item.GroupAssignments).ThenInclude(assignment => assignment.Group)
        .Include(item => item.Group)
        .Where(item => item.GroupAssignments.Any(assignment => assignment.GroupId == id) ||
            (item.GroupId == id && !item.GroupAssignments.Any()))
        .OrderByDescending(item => item.MeetingDate)
        .Select(item => new
        {
            item.Id,
            item.Number,
            item.Text,
            item.MeetingDate,
            item.MeetingDateJalali,
            item.IsArchived,
            MatchingGroupNames = item.GroupAssignments.Where(assignment => assignment.GroupId == id).Select(assignment => assignment.Group!.Name).ToList(),
            GroupNames = item.GroupAssignments.Select(assignment => assignment.Group!.Name).ToList(),
            LegacyReference = !item.GroupAssignments.Any(),
            LegacyGroupName = item.Group == null ? "" : item.Group.Name
        })
        .ToListAsync();
    if (references.Count > 0)
        return Results.Conflict(new { error = "این گروه به مصوبه ارجاع شده و قابل حذف نیست.", resolutions = references });
    db.Groups.Remove(group);
    await db.SaveChangesAsync();
    return Results.NoContent();
});
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
    var directory = await db.Directory.AsNoTracking().ToListAsync();
    var users = await db.Users.AsNoTracking().ToDictionaryAsync(user => user.NationalId, user => user.OrgPositionDesc);
    var people = directory
        .Where(person => Normalize(person.DisplayName).Contains(normalized) ||
            (digits.Length >= 2 && person.NationalId.Contains(digits)))
        .OrderBy(person => person.DisplayName)
        .Take(30)
        .Select(person => new { person.NationalId, person.DisplayName, Title = string.IsNullOrWhiteSpace(users.GetValueOrDefault(person.NationalId)) ? person.Title : users.GetValueOrDefault(person.NationalId) })
        .ToList();
    return Results.Ok(people);
});
app.MapPost("/api/groups/{id:int}/members/lookup", async (int id, MemberLookupRequest request, AppDb db, NationalIdLookup lookup) =>
{
    var group = await db.Groups.Include(g => g.Members).FirstOrDefaultAsync(g => g.Id == id); if (group is null) return Results.NotFound();
    var person = await lookup.FindAsync(request.NationalId); if (person is null) return Results.NotFound(new { error = "کاربری با این کد ملی در فهرست کاربران پیدا نشد." });
    var appUser = await db.Users.AsNoTracking().FirstOrDefaultAsync(user => user.NationalId == person.NationalId);
    var directoryUser = await db.Directory.AsNoTracking().FirstOrDefaultAsync(user => user.NationalId == person.NationalId);
    var title = !string.IsNullOrWhiteSpace(appUser?.OrgPositionDesc) ? appUser.OrgPositionDesc : directoryUser?.Title ?? "";
    var existingMember = group.Members.FirstOrDefault(member => member.NationalId == person.NationalId);
    if (existingMember is null) group.Members.Add(new GroupMember { NationalId = person.NationalId, DisplayName = person.DisplayName, Title = title });
    else { existingMember.DisplayName = person.DisplayName; existingMember.Title = title; }
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
    var title = "";
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
app.MapGet("/api/users", async (HttpContext context, AppDb db) =>
{
    if (!context.User.IsInRole("ادمین")) return Results.StatusCode(StatusCodes.Status403Forbidden);
    var directory = await db.Directory.AsNoTracking().OrderBy(u => u.DisplayName).ToListAsync();
    var usersById = await db.Users.AsNoTracking().ToDictionaryAsync(user => user.NationalId, user => user);
    return Results.Ok(directory.Select(user =>
    {
        var account = usersById.GetValueOrDefault(user.NationalId);
        var title = account?.OrgPositionDesc ?? user.Title;
        return new
        {
            user.NationalId,
            user.DisplayName,
            Title = title,
            Role = account?.Role ?? "کاربر",
            Mobile = account?.Mobile ?? "",
            CanChangeRole = user.NationalId != primaryAdminNationalId && user.NationalId != context.User.FindFirstValue(ClaimTypes.NameIdentifier),
            Province = title.Contains("مدیر کل", StringComparison.OrdinalIgnoreCase) ? ExtractProvince(title) : null
        };
    }));
});
app.MapPatch("/api/users/{nationalId}/mobile", async (string nationalId, UpdateMobileRequest request, HttpContext context, AppDb db) =>
{
    if (!context.User.IsInRole("ادمین")) return Results.Forbid();
    var normalizedId = NormalizeDigits(nationalId.Trim());
    var person = await db.Directory.FirstOrDefaultAsync(user => user.NationalId == normalizedId);
    if (person is null) return Results.NotFound(new { error = "کاربر در فهرست اشخاص پیدا نشد." });
    var mobile = NormalizeDigits(request.Mobile ?? "").Trim();
    var digits = new string(mobile.Where(char.IsDigit).ToArray());
    if (digits.Length > 0 && (digits.Length < 10 || digits.Length > 15))
        return Results.BadRequest(new { error = "شماره موبایل باید بین ۱۰ تا ۱۵ رقم باشد." });
    var account = await db.Users.FirstOrDefaultAsync(user => user.NationalId == normalizedId);
    if (account is null)
    {
        account = new AppUser { NationalId = normalizedId, DisplayName = person.DisplayName };
        db.Users.Add(account);
    }
    account.Mobile = digits;
    account.MobileOverriddenByAdmin = true;
    await db.SaveChangesAsync();
    return Results.Ok(new { person.NationalId, person.DisplayName, Mobile = account.Mobile });
});
app.MapPatch("/api/users/{nationalId}/role", async (string nationalId, SetUserRoleRequest request, HttpContext context, AppDb db) =>
{
    var normalizedId = NormalizeDigits(nationalId.Trim());
    var person = await db.Directory.FirstOrDefaultAsync(user => user.NationalId == normalizedId);
    if (person is null) return Results.NotFound(new { error = "کاربر در فهرست اشخاص پیدا نشد." });
    if (!request.IsAdmin && normalizedId == primaryAdminNationalId)
        return Results.Conflict(new { error = "دسترسی ادمین اصلی قابل حذف نیست." });
    if (!request.IsAdmin && normalizedId == context.User.FindFirstValue(ClaimTypes.NameIdentifier))
        return Results.Conflict(new { error = "نمی‌توانید دسترسی ادمین حساب فعلی خودتان را حذف کنید." });

    var account = await db.Users.FirstOrDefaultAsync(user => user.NationalId == normalizedId);
    if (account is null)
    {
        account = new AppUser { NationalId = normalizedId, DisplayName = person.DisplayName };
        db.Users.Add(account);
    }
    if (!request.IsAdmin && account.Role == "ادمین")
    {
        var adminCount = await db.Users.CountAsync(user => user.Role == "ادمین");
        if (adminCount <= 1) return Results.Conflict(new { error = "حداقل یک ادمین باید در سامانه باقی بماند." });
    }
    account.DisplayName = person.DisplayName;
    account.Role = request.IsAdmin ? "ادمین" : "کاربر";
    await db.SaveChangesAsync();
    return Results.Ok(new { nationalId = normalizedId, displayName = person.DisplayName, role = account.Role });
});
app.MapGet("/api/settings/bale-notifications", async (HttpContext context, AppDb db, IConfiguration configuration) =>
{
    if (!context.User.IsInRole("ادمین")) return Results.Forbid();
    var setting = await db.Settings.AsNoTracking().FirstOrDefaultAsync(item => item.Key == "BaleNotificationsEnabled");
    var username = configuration["BALE_USERNAME"] ?? configuration["Bale:Username"];
    var password = configuration["BALE_PASSWORD"] ?? configuration["Bale:Password"];
    var configured = !string.IsNullOrWhiteSpace(username) && !string.IsNullOrWhiteSpace(password);
    return Results.Ok(new { enabled = setting?.Value == "true", configured });
});
app.MapPut("/api/settings/bale-notifications", async (BaleNotificationSettingRequest request, HttpContext context, AppDb db) =>
{
    if (!context.User.IsInRole("ادمین")) return Results.Forbid();
    var setting = await db.Settings.FirstOrDefaultAsync(item => item.Key == "BaleNotificationsEnabled");
    if (setting is null)
        db.Settings.Add(new AppSetting { Key = "BaleNotificationsEnabled", Value = request.Enabled ? "true" : "false" });
    else
        setting.Value = request.Enabled ? "true" : "false";
    await db.SaveChangesAsync();
    return Results.Ok(new { enabled = request.Enabled });
});

app.MapGet("/api/reports", async (HttpContext context, AppDb db) =>
{
    var id = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    var isAdmin = context.User.IsInRole("ادمین");
    var records = await db.Resolutions.Where(item => !item.IsArchived).Include(r => r.Assignments).Include(r => r.Progress).Include(r => r.Group).ThenInclude(g => g!.Members).Include(r => r.GroupAssignments).ThenInclude(a => a.Group).ThenInclude(g => g!.Members).ToListAsync();
    var directory = await db.Directory.ToDictionaryAsync(u => u.NationalId, u => (DisplayName: u.DisplayName, Title: u.Title));
    var userTitles = await db.Users.ToDictionaryAsync(u => u.NationalId, u => u.OrgPositionDesc);
    var personRows = new List<(string NationalId, string DisplayName, string Title, int ResolutionId, string Number, string Text, string? DueDateJalali, string Status)>();
    foreach (var record in records)
    {
        var participants = (record.Group?.Members.Select(member => (NationalId: member.NationalId, DisplayName: member.DisplayName, Title: userTitles.GetValueOrDefault(member.NationalId, member.Title))) ?? Enumerable.Empty<(string NationalId, string DisplayName, string Title)>())
            .Concat(record.GroupAssignments.SelectMany(assignment => assignment.Group!.Members.Select(member => (NationalId: member.NationalId, DisplayName: member.DisplayName, Title: userTitles.GetValueOrDefault(member.NationalId, member.Title)))))
            .Concat(record.Assignments.Select(assignment =>
            {
                var person = directory.GetValueOrDefault(assignment.NationalId, (DisplayName: assignment.NationalId, Title: ""));
                return (NationalId: assignment.NationalId, DisplayName: person.DisplayName, Title: userTitles.GetValueOrDefault(assignment.NationalId, person.Title));
            }))
            .DistinctBy(person => person.NationalId);

        foreach (var person in participants)
        {
            var personStatus = record.Progress.FirstOrDefault(progress => progress.NationalId == person.NationalId)?.Status ?? record.Status;
            personRows.Add((person.NationalId, person.DisplayName, person.Title, record.Id, record.Number, record.Text, record.DueDateJalali, personStatus));
        }
    }

    var rows = personRows
        .GroupBy(person => new { person.NationalId, person.DisplayName, person.Title })
        .Select(group => new
        {
            group.Key.NationalId,
            group.Key.DisplayName,
            group.Key.Title,
            Total = group.Count(),
            Completed = group.Count(person => person.Status == "completed"),
            Delayed = group.Count(person => person.Status == "delayed"),
            Pending = group.Count(person => person.Status is "before" or "in_progress"),
            Tasks = group.Select(person => new { ResolutionId = person.ResolutionId, Number = person.Number, Text = person.Text, DueDateJalali = person.DueDateJalali, Status = person.Status }).ToList()
        })
        .OrderByDescending(person => person.Total).ToList();
    if (!isAdmin) rows = rows.Where(row => row.NationalId == id).ToList();
    return Results.Ok(new { total = records.Count, completed = records.Count(r => r.Status == "completed"), delayed = records.Count(r => r.Status == "delayed"), pending = records.Count(r => r.Status is "before" or "in_progress"), people = rows });
});
app.MapPost("/api/resolutions/{id:int}/warnings", async (int id, WarningRecipientsRequest request, AppDb db, HttpContext context) =>
{
    if (!context.User.IsInRole("ادمین")) return Results.Forbid();
    var nationalIds = (request.NationalIds ?? new List<string>())
        .Where(value => !string.IsNullOrWhiteSpace(value))
        .Select(value => NormalizeDigits(value.Trim()))
        .Where(value => value.Length > 0)
        .Distinct()
        .ToList();
    if (nationalIds.Count == 0) return Results.BadRequest(new { error = "حداقل یک کاربر را انتخاب کنید." });
    if (nationalIds.Count > 100) return Results.BadRequest(new { error = "در هر نوبت حداکثر ۱۰۰ کاربر قابل انتخاب است." });

    var resolution = await db.Resolutions
        .Where(item => item.Id == id && !item.IsArchived && item.Status != "cancelled")
        .Include(item => item.Assignments)
        .Include(item => item.Progress)
        .Include(item => item.Group).ThenInclude(group => group!.Members)
        .Include(item => item.GroupAssignments).ThenInclude(assignment => assignment.Group).ThenInclude(group => group!.Members)
        .FirstOrDefaultAsync(context.RequestAborted);
    if (resolution is null) return Results.NotFound(new { error = "مصوبه پیدا نشد یا لغو شده است." });

    var directory = await db.Directory.AsNoTracking()
        .Where(person => nationalIds.Contains(person.NationalId))
        .ToDictionaryAsync(person => person.NationalId, context.RequestAborted);
    var accounts = await db.Users.AsNoTracking()
        .Where(user => nationalIds.Contains(user.NationalId))
        .ToDictionaryAsync(user => user.NationalId, context.RequestAborted);
    var results = new List<object>();
    var queued = 0;
    var inAppCount = 0;

    foreach (var nationalId in nationalIds)
    {
        var memberStatus = resolution.Progress.FirstOrDefault(progress => progress.NationalId == nationalId)?.Status ?? resolution.Status;
        var isAssigned = resolution.Assignments.Any(assignment => assignment.NationalId == nationalId)
            || resolution.Group?.Members.Any(member => member.NationalId == nationalId) == true
            || resolution.GroupAssignments.Any(assignment => assignment.Group?.Members.Any(member => member.NationalId == nationalId) == true);
        var profile = directory.GetValueOrDefault(nationalId);
        var account = accounts.GetValueOrDefault(nationalId);
        var name = profile?.DisplayName ?? account?.DisplayName ?? "کاربر";
        if (!isAssigned || memberStatus is not ("delayed" or "in_progress"))
        {
            results.Add(new { nationalId, displayName = name, queued = false, inApp = false, reason = "وظیفهٔ با تأخیر یا در حال اجرا ندارد." });
            continue;
        }

        var statusText = memberStatus == "delayed" ? "دارای تأخیر" : "در حال اجرا";
        var title = string.IsNullOrWhiteSpace(profile?.Title) ? account?.OrgPositionDesc : profile.Title;
        var message = BaleMessageText.ForWarning(resolution, name, statusText, title);
        var now = DateTimeOffset.UtcNow;
        db.Notifications.Add(new UserNotification
        {
            NationalId = nationalId,
            ResolutionId = resolution.Id,
            Type = "bale-warning",
            DateKey = "bale-warning:" + Guid.NewGuid().ToString("N"),
            Text = message,
            CreatedAt = now
        });
        inAppCount++;

        var mobile = account?.Mobile;
        if (string.IsNullOrWhiteSpace(mobile))
        {
            results.Add(new { nationalId, displayName = name, queued = false, inApp = true, reason = "هشدار داخل سامانه ثبت شد؛ شمارهٔ موبایل ثبت نشده است." });
            continue;
        }

        db.BaleMessageQueue.Add(new BaleQueuedMessage
        {
            NationalId = nationalId,
            Mobile = mobile,
            Text = message,
            Status = "pending",
            CreatedAtUnixMs = now.ToUnixTimeMilliseconds(),
            NextAttemptAtUnixMs = now.ToUnixTimeMilliseconds()
        });
        queued++;
        results.Add(new { nationalId, displayName = name, queued = true, inApp = true, reason = "" });
    }

    await db.SaveChangesAsync(context.RequestAborted);
    return Results.Ok(new { resolutionId = id, resolutionNumber = resolution.Number, selected = nationalIds.Count, queued, inAppNotifications = inAppCount, failed = nationalIds.Count - queued, results });
});
app.MapPost("/api/reports/warnings/{nationalId}", async (string nationalId, AppDb db, HttpContext context) =>
{
    var normalizedId = NormalizeDigits(nationalId.Trim());
    var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(3.5));
    var records = await db.Resolutions.Where(item => !item.IsArchived && item.Status != "cancelled")
        .Include(item => item.Assignments).Include(item => item.Progress).Include(item => item.Group).ThenInclude(group => group!.Members)
        .Include(item => item.GroupAssignments).ThenInclude(assignment => assignment.Group).ThenInclude(group => group!.Members).ToListAsync(context.RequestAborted);
    var delayed = records.Where(item =>
        (item.Progress.FirstOrDefault(progress => progress.NationalId == normalizedId)?.Status ?? item.Status) == "delayed"
        || (((item.Progress.FirstOrDefault(progress => progress.NationalId == normalizedId)?.Status ?? item.Status) != "completed")
            && item.DueDate.HasValue && item.DueDate.Value < today))
        .Where(item => item.Assignments.Any(assignment => assignment.NationalId == normalizedId)
            || item.Group?.Members.Any(member => member.NationalId == normalizedId) == true
            || item.GroupAssignments.Any(assignment => assignment.Group?.Members.Any(member => member.NationalId == normalizedId) == true))
        .ToList();
    if (delayed.Count == 0) return Results.Conflict(new { error = "برای این شخص مصوبه دارای تأخیر پیدا نشد." });

    var account = await db.Users.AsNoTracking().FirstOrDefaultAsync(user => user.NationalId == normalizedId, context.RequestAborted);
    var directoryProfile = await db.Directory.AsNoTracking().FirstOrDefaultAsync(person => person.NationalId == normalizedId, context.RequestAborted);
    var displayName = directoryProfile?.DisplayName ?? account?.DisplayName ?? "کاربر";
    var title = string.IsNullOrWhiteSpace(directoryProfile?.Title) ? account?.OrgPositionDesc : directoryProfile.Title;
    var message = BaleMessageText.ForOverdueWarnings(displayName, delayed, normalizedId, title);
    var now = DateTimeOffset.UtcNow;
    db.Notifications.Add(new UserNotification
    {
        NationalId = normalizedId,
        Type = "bale-warning",
        DateKey = "bale-warning:" + Guid.NewGuid().ToString("N"),
        Text = message,
        CreatedAt = now
    });
    var mobile = account?.Mobile ?? "";
    var queued = !string.IsNullOrWhiteSpace(mobile);
    if (queued)
    {
        db.BaleMessageQueue.Add(new BaleQueuedMessage
        {
            NationalId = normalizedId,
            Mobile = mobile,
            Text = message,
            Status = "pending",
            CreatedAtUnixMs = now.ToUnixTimeMilliseconds(),
            NextAttemptAtUnixMs = now.ToUnixTimeMilliseconds()
        });
    }
    await db.SaveChangesAsync(context.RequestAborted);
    return Results.Ok(new { inApp = true, queued, count = delayed.Count, reason = queued ? "" : "اعلان داخل سامانه ثبت شد؛ شمارهٔ موبایل این کاربر ثبت نشده است." });
});
static List<(string Key, DateOnly DueDate)> BuildDueReportPeriods(DateOnly startDate, string frequency, DateOnly today)
{
    var periods = new List<(string Key, DateOnly DueDate)>();
    if (today < startDate) return periods;
    if (frequency == "daily")
    {
        for (var date = startDate; date <= today; date = date.AddDays(1))
            periods.Add(("daily:" + date.ToString("yyyy-MM-dd"), date));
    }
    else if (frequency == "weekly")
    {
        for (var dueDate = startDate.AddDays(7); dueDate <= today; dueDate = dueDate.AddDays(7))
            periods.Add(("weekly:" + dueDate.ToString("yyyy-MM-dd"), dueDate));
    }
    else if (frequency == "monthly")
    {
        for (var month = 1; ; month++)
        {
            DateOnly dueDate;
            try { dueDate = startDate.AddMonths(month); }
            catch (ArgumentOutOfRangeException) { break; }
            if (dueDate > today) break;
            periods.Add(("monthly:" + dueDate.ToString("yyyy-MM-dd"), dueDate));
        }
    }
    return periods;
}

static string? ExtractProvince(string title)
{
    var clean = title.Trim();
    foreach (var prefix in new[] { "مدیر کل", "مدیرکل" })
        if (clean.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            return clean[prefix.Length..].Trim(' ', '،', '-', 'ـ');
    return null;
}

static async Task<Dictionary<string, string>> LoadPersonDisplayNames(AppDb db)
{
    var names = new Dictionary<string, string>(StringComparer.Ordinal);
    foreach (var member in await db.GroupMembers.AsNoTracking().ToListAsync())
        if (!string.IsNullOrWhiteSpace(member.DisplayName)) names[member.NationalId] = member.DisplayName;
    foreach (var user in await db.Users.AsNoTracking().Select(user => new { user.NationalId, user.DisplayName }).ToListAsync())
        if (!string.IsNullOrWhiteSpace(user.DisplayName)) names[user.NationalId] = user.DisplayName;
    foreach (var person in await db.Directory.AsNoTracking().Select(person => new { person.NationalId, person.DisplayName }).ToListAsync())
        if (!string.IsNullOrWhiteSpace(person.DisplayName)) names[person.NationalId] = person.DisplayName;
    return names;
}

static string NormalizeStatusEventText(ResolutionEvent entry, IReadOnlyDictionary<string, string> displayNames)
{
    const string prefix = "وضعیت پیگیری ";
    if (!entry.Text.StartsWith(prefix, StringComparison.Ordinal)) return entry.Text;
    var marker = entry.Text.IndexOf(" به «", prefix.Length, StringComparison.Ordinal);
    if (marker < 0) return entry.Text;
    var target = entry.Text[prefix.Length..marker].Trim();
    var targetId = target.All(char.IsDigit) ? target : target == "کاربر" ? entry.NationalId : "";
    var name = targetId.Length > 0 ? displayNames.GetValueOrDefault(targetId, "عضو مصوبه") : target;
    var detail = entry.Text[marker..]
        .Replace("«rejected»", "«رد شده»", StringComparison.Ordinal)
        .Replace("«in_progress»", "«در حال اجرا»", StringComparison.Ordinal)
        .Replace("«completed»", "«اجرا شده»", StringComparison.Ordinal);
    return prefix + name + detail;
}

app.MapFallbackToFile("index.html");
app.Run();

record ResolutionCreate(DateOnly MeetingDate, string? MeetingDateJalali, string Number, string Text, string? Notes, string Status, int? GroupId, List<int>? GroupIds, List<string> People, bool PublishToAll, DateOnly? DueDate, string? DueDateJalali, DateOnly? StartDate, string? StartDateJalali, bool RequiresPeriodicReport, string? ReportFrequency, string? CancellationReason);
record ResolutionStatusUpdate(string Status, string? Notes, string? NationalId);
record ResolutionBulkStatusUpdate(string Status, string? Notes);
record GroupCreate(string Name);
record GroupCategoryRequest(string Category);
record ResolutionEventCreate(string Text, string NationalId, string? UserName);
record AttachmentApprovalRequest(string NationalId, bool ApprovedForAll);
record CompletionReportRequest(string NationalId, string UserName, string Text);
record ResolutionSubmissionRequest(string Text);
record CompletionReviewRequest(string NationalId, string AssigneeNationalId, bool Approved, string? Feedback);
record ArchiveUpdateRequest(string NationalId, bool IsArchived);
record NotificationReadRequest(string NationalId);
record MemberLookupRequest(string NationalId);
static class ResolutionStatusUpdater
{
    private static readonly SemaphoreSlim Gate = new(1, 1);
    public static string TimeBasedResolutionStatus(DateOnly meetingDate, DateOnly startDate, DateOnly? dueDate, DateOnly today)
    {
        if (today < startDate) return "before";
        if (dueDate.HasValue && today > dueDate.Value) return "delayed";
        return "in_progress";
    }
    public static async Task RefreshResolutionStatuses(AppDb db)
    {
        await Gate.WaitAsync();
        try
        {
            var today = DateOnly.FromDateTime(DateTime.Today);
            var records = await db.Resolutions.Where(item => !item.IsArchived && item.Status != "completed" && item.Status != "cancelled")
                .Include(item => item.Progress).Include(item => item.Assignments).Include(item => item.GroupAssignments).Include(item => item.Events).ToListAsync();
            if (records.Count == 0) return;
            var groupIds = records.SelectMany(item => item.GroupAssignments.Select(group => group.GroupId)
                .Concat(item.GroupId.HasValue ? new[] { item.GroupId.Value } : Array.Empty<int>())).Distinct().ToList();
            var memberships = groupIds.Count == 0 ? new List<(int GroupId, string NationalId)>()
                : (await db.GroupMembers.Where(member => groupIds.Contains(member.GroupId)).Select(member => new { member.GroupId, member.NationalId }).ToListAsync())
                    .Select(member => (member.GroupId, member.NationalId)).ToList();
            var directoryIds = await db.Directory.Select(person => person.NationalId).ToListAsync();
            var userIds = await db.Users.Select(user => user.NationalId).ToListAsync();
            var changed = false;
            foreach (var item in records)
            {
                var startDate = item.StartDate ?? item.MeetingDate;
                var computed = TimeBasedResolutionStatus(item.MeetingDate, startDate, item.DueDate, today);
                if (item.DueDate.HasValue && today > item.DueDate.Value)
                {
                    var recipients = item.Assignments.Select(assignment => assignment.NationalId).ToHashSet(StringComparer.Ordinal);
                    var linkedGroups = item.GroupAssignments.Select(group => group.GroupId).ToHashSet();
                    if (item.GroupId.HasValue) linkedGroups.Add(item.GroupId.Value);
                    recipients.UnionWith(memberships.Where(member => linkedGroups.Contains(member.GroupId)).Select(member => member.NationalId));
                    if (item.PublishToAll) { recipients.UnionWith(directoryIds); recipients.UnionWith(userIds); }
                    if (recipients.Count > 0)
                    {
                        var done = item.Progress.Where(progress => progress.Status == "completed").Select(progress => progress.NationalId).ToHashSet(StringComparer.Ordinal);
                        var dueDate = item.DueDate.Value;
                        done.UnionWith(item.Events.Where(entry => !string.IsNullOrWhiteSpace(entry.NationalId)
                            && !entry.Text.StartsWith("وضعیت پیگیری", StringComparison.Ordinal)
                            && DateOnly.FromDateTime(entry.CreatedAt.LocalDateTime) > dueDate).Select(entry => entry.NationalId));
                        if (recipients.All(done.Contains)) computed = "completed";
                    }
                }
                if (item.Status != computed) { item.Status = computed; item.UpdatedAt = DateTimeOffset.UtcNow; changed = true; }
            }
            if (changed) await db.SaveChangesAsync();
        }
        finally { Gate.Release(); }
    }
}
sealed class ResolutionStatusRefreshService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ResolutionStatusRefreshService> _logger;
    public ResolutionStatusRefreshService(IServiceScopeFactory scopeFactory, ILogger<ResolutionStatusRefreshService> logger)
    { _scopeFactory = scopeFactory; _logger = logger; }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDb>();
                await ResolutionStatusUpdater.RefreshResolutionStatuses(db);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception error) { _logger.LogError(error, "Could not refresh resolution statuses."); }
            try { await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}

static class ResolutionStatuses { public static readonly string[] All = ["before", "in_progress", "completed", "delayed", "cancelled"]; public static readonly string[] Frequencies = ["daily", "weekly", "monthly"]; }
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

record CreateDirectoryPerson(string NationalId, string FirstName, string LastName);
record SsoLoginRequest(string? Code);

sealed class RawUpstreamResult(byte[] body, string? contentType, int statusCode) : IResult
{
    public async Task ExecuteAsync(HttpContext context)
    {
        context.Response.StatusCode = statusCode;
        if (!string.IsNullOrWhiteSpace(contentType)) context.Response.ContentType = contentType;
        context.Response.ContentLength = body.LongLength;
        await context.Response.Body.WriteAsync(body, context.RequestAborted);
    }
}