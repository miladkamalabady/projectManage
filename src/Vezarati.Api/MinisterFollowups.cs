using System.Security.Claims;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Vezarati.Api.Models;

static class MinisterFollowups
{
    public const string EventPrefix = "پیگیری مجدد دستور وزیر ثبت شد.";
    public sealed record Request(string RequestId);

    public static async Task<HashSet<string>> Recipients(AppDb db, Resolution item, ClaimsPrincipal actor, CancellationToken ct)
    {
        var groups = await db.ResolutionGroups.Where(group => group.ResolutionId == item.Id).Select(group => group.GroupId).ToListAsync(ct);
        if (item.GroupId.HasValue) groups.Add(item.GroupId.Value);
        var ids = (await db.Assignments.Where(person => person.ResolutionId == item.Id).Select(person => person.NationalId).ToListAsync(ct)).ToHashSet();
        ids.UnionWith(await db.GroupMembers.Where(member => groups.Contains(member.GroupId)).Select(member => member.NationalId).ToListAsync(ct));
        if (item.PublishToAll) ids.UnionWith(await db.Users.Select(person => person.NationalId).ToListAsync(ct));
        if (actor.IsInRole(AdminAccess.MinisterLiaison))
        {
            var eligible = await MinisterLiaisonAccess.People(db, actor.FindFirstValue("minister-province") ?? "").ToListAsync(ct);
            ids.IntersectWith(eligible);
        }
        var liaisons = await db.Users.AsNoTracking().Where(user => user.Role == AdminAccess.MinisterLiaison && user.MinisterLiaisonProvince != "")
            .Select(user => new { user.NationalId, user.MinisterLiaisonProvince }).ToListAsync(ct);
        foreach (var liaison in liaisons)
        {
            if (actor.IsInRole(AdminAccess.MinisterLiaison) && liaison.MinisterLiaisonProvince != actor.FindFirstValue("minister-province")) continue;
            var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Role, AdminAccess.MinisterLiaison), new Claim("minister-province", liaison.MinisterLiaisonProvince)]));
            if (await MinisterLiaisonAccess.Filter(db.Resolutions, principal, db).AnyAsync(resolution => resolution.Id == item.Id, ct)) ids.Add(liaison.NationalId);
        }
        ids.RemoveWhere(string.IsNullOrWhiteSpace);
        return ids;
    }

    public static async Task<IResult> Send(int id, Request request, HttpContext context, AppDb db)
    {
        if (!AdminAccess.IsAdmin(context.User)) return Results.Forbid();
        if (!Guid.TryParse(request.RequestId, out var requestId)) return Results.BadRequest(new { error = "شناسه درخواست معتبر نیست." });
        var ct = context.RequestAborted;
        var item = await AdminAccess.Filter(db.Resolutions.AsNoTracking(), context.User, db)
            .FirstOrDefaultAsync(item => item.Id == id && item.IsSpecialTracking && item.SpecialTrackingType != "provincial" && !item.IsArchived, ct);
        if (item is null) return Results.NotFound();
        if (item.IsForInformation || item.Status is "completed" or "cancelled") return Results.Conflict(new { error = "برای دستور جهت اطلاع، انجام‌شده یا لغوشده پیگیری مجدد ارسال نمی‌شود." });
        if (!await db.Settings.AnyAsync(setting => setting.Key == "BaleNotificationsEnabled" && setting.Value == "true", ct))
            return Results.Conflict(new { error = "ارسال پیام بله غیرفعال است؛ ابتدا آن را در تنظیمات فعال کنید." });
        var key = "minister-followup:" + requestId.ToString("N");
        if (await db.Notifications.AnyAsync(notification => notification.ResolutionId == id && notification.DateKey == key, ct))
            return Results.Ok(new { duplicate = true, queued = 0, missingMobile = Array.Empty<string>() });
        var recipients = await Recipients(db, item, context.User, ct);
        var people = await db.Users.AsNoTracking().Where(person => recipients.Contains(person.NationalId))
            .Select(person => new { person.NationalId, person.DisplayName, person.Mobile }).ToListAsync(ct);
        if (recipients.Count == 0) return Results.Conflict(new { error = "برای این دستور گیرنده یا رابط استانی مشخص نشده است." });
        var now = DateTimeOffset.UtcNow;
        var queued = 0;
        var missingMobile = new List<string>();
        foreach (var recipient in recipients)
        {
            var person = people.FirstOrDefault(person => person.NationalId == recipient);
            var text = "🔁 پیگیری مجدد دستور وزیر\n" + (person?.DisplayName ?? "کاربر") + " گرامی\nشماره دستور: " + item.Number +
                "\nموضوع: " + (item.IsConfidential ? "محرمانه" : item.Text.Length > 1200 ? item.Text[..1200] + "…" : item.Text) +
                "\nمهلت اجرا: " + (item.DueDate.HasValue ? JalaliDate.FromGregorian(item.DueDate.Value) : "تعیین نشده") +
                "\nلطفاً وضعیت اقدام و پاسخ این دستور را همراه مستندات در سامانه ثبت کنید.";
            text = BaleMessageText.WithDetectedResolutionTags(BaleMessageText.WithResolutionId(text, item.Id));
            db.Notifications.Add(new UserNotification { NationalId = recipient, ResolutionId = id, Type = "bale-warning", DateKey = key, Text = text, CreatedAt = now });
            if (string.IsNullOrWhiteSpace(person?.Mobile)) { missingMobile.Add(person?.DisplayName ?? recipient); continue; }
            db.BaleMessageQueue.Add(new BaleQueuedMessage { NationalId = recipient, Mobile = person.Mobile, Text = text, Status = "pending", CreatedAtUnixMs = now.ToUnixTimeMilliseconds(), NextAttemptAtUnixMs = now.ToUnixTimeMilliseconds() });
            queued++;
        }
        db.Events.Add(new ResolutionEvent { ResolutionId = id, NationalId = context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "", UserName = context.User.Identity?.Name ?? "ادمین",
            Text = EventPrefix + " " + queued + " پیام بله در صف ارسال قرار گرفت؛ " + missingMobile.Count + " گیرنده بدون شماره موبایل.", CreatedAt = now });
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException exception) when (exception.InnerException is SqlException { Number: 2601 or 2627 })
        {
            db.ChangeTracker.Clear();
            if (await db.Notifications.AnyAsync(notification => notification.ResolutionId == id && notification.DateKey == key, ct))
                return Results.Ok(new { duplicate = true, queued = 0, missingMobile = Array.Empty<string>() });
            throw;
        }
        return Results.Ok(new { duplicate = false, queued, recipients = recipients.Count, missingMobile });
    }

    public static async Task<IResult> Reports(int id, HttpContext context, AppDb db)
    {
        if (!AdminAccess.IsAdmin(context.User)) return Results.Forbid();
        var ct = context.RequestAborted;
        if (!await AdminAccess.Filter(db.Resolutions.AsNoTracking(), context.User, db).AnyAsync(item => item.Id == id && item.IsSpecialTracking && item.SpecialTrackingType != "provincial", ct)) return Results.NotFound();
        var people = await db.ResolutionReports.Where(report => report.ResolutionId == id).Select(report => report.NationalId)
            .Union(db.Progress.Where(progress => progress.ResolutionId == id && progress.ReportText != "").Select(progress => progress.NationalId)).Distinct().ToListAsync(ct);
        return await DashboardTasks.ReadPersonReports(db, id, people, ct);
    }

    public static async Task<IResult> Report(HttpContext context, AppDb db, string? q, string? status, string? from, string? to, bool print = false, int page = 1, string? category = null, string? priority = null, string? information = null, string? presence = null)
    {
        if (!AdminAccess.IsAdmin(context.User)) return Results.Forbid();
        if (status is not (null or "" or "all" or "completed" or "pending" or "overdue" or "info" or "cancelled")) return Results.BadRequest();
        DateOnly? fromDate = null, toDate = null;
        if (!string.IsNullOrWhiteSpace(from)) { if (!DateOnly.TryParseExact(from, "yyyy-MM-dd", out var parsed)) return Results.BadRequest(); fromDate = parsed; }
        if (!string.IsNullOrWhiteSpace(to)) { if (!DateOnly.TryParseExact(to, "yyyy-MM-dd", out var parsed)) return Results.BadRequest(); toDate = parsed; }
        if (fromDate > toDate) return Results.BadRequest();
        if (priority is not (null or "" or "آنی" or "فوری" or "عادی") || information is not (null or "" or "all" or "info" or "action") || presence is not (null or "" or "all" or "has" or "missing")) return Results.BadRequest();
        var ct = context.RequestAborted;
        var today = ProvincialTrips.CurrentDate;
        var query = AdminAccess.Filter(db.Resolutions.AsNoTracking(), context.User, db)
            .Where(item => item.IsSpecialTracking && item.SpecialTrackingType != "provincial" && !item.IsArchived);
        if (fromDate.HasValue) query = query.Where(item => item.MeetingDate >= fromDate.Value);
        if (toDate.HasValue) query = query.Where(item => item.MeetingDate <= toDate.Value);
        if (!string.IsNullOrWhiteSpace(category))
        {
            var marker = "\u001Fminister-category:" + Uri.EscapeDataString(category);
            query = query.Where(item => item.Notes.EndsWith(marker) || item.Notes.Contains(marker + "\n"));
        }
        if (priority is "آنی" or "فوری")
        {
            var marker = "\u001Fpriority:" + Uri.EscapeDataString(priority);
            query = query.Where(item => item.Notes.Contains(marker));
        }
        else if (priority == "عادی") query = query.Where(item => !item.Notes.Contains("\u001Fpriority:"));
        if (information == "info") query = query.Where(item => item.IsForInformation);
        if (information == "action") query = query.Where(item => !item.IsForInformation);
        if (presence == "has") query = query.Where(item => item.Progress.Any(progress => progress.ReportText != "") || db.ResolutionReports.Any(report => report.ResolutionId == item.Id));
        if (presence == "missing") query = query.Where(item => !item.Progress.Any(progress => progress.ReportText != "") && !db.ResolutionReports.Any(report => report.ResolutionId == item.Id));
        if (!string.IsNullOrWhiteSpace(q)) query = query.Where(item => item.Number.Contains(q) || item.Id.ToString() == q || item.Text.Contains(q) || item.Notes.Contains(q) ||
            item.Assignments.Any(person => db.Users.Any(user => user.NationalId == person.NationalId && (user.DisplayName.Contains(q) || (user.Title ?? "").Contains(q) || user.OrganizationUnit.Contains(q)))) ||
            item.GroupAssignments.Any(group => group.Group!.Name.Contains(q)) || (item.Group != null && item.Group.Name.Contains(q)) ||
            db.ResolutionReports.Any(report => report.ResolutionId == item.Id && (report.Text.Contains(q) || report.UserName.Contains(q))) || item.Progress.Any(progress => progress.ReportText.Contains(q)));
        query = status switch {
            "info" => query.Where(item => item.IsForInformation),
            "completed" => query.Where(item => !item.IsForInformation && item.Status == "completed"),
            "cancelled" => query.Where(item => item.Status == "cancelled"),
            "pending" => query.Where(item => !item.IsForInformation && item.Status != "completed" && item.Status != "cancelled"),
            "overdue" => query.Where(item => !item.IsForInformation && item.Status != "completed" && item.Status != "cancelled" && item.DueDate < today), _ => query
        };
        var counts = await query.GroupBy(_ => 1).Select(group => new { total = group.Count(), completed = group.Count(item => !item.IsForInformation && item.Status == "completed"),
            pending = group.Count(item => !item.IsForInformation && item.Status != "completed" && item.Status != "cancelled"),
            overdue = group.Count(item => !item.IsForInformation && item.Status != "completed" && item.Status != "cancelled" && item.DueDate < today) }).SingleOrDefaultAsync(ct);
        var selected = query.OrderBy(item => item.IsForInformation || item.Status == "completed" || item.Status == "cancelled")
            .ThenBy(item => item.DueDate).ThenByDescending(item => item.Id).AsQueryable();
        page = Math.Max(1, page);
        if (!print) selected = selected.Skip((page - 1) * 50).Take(50);
        var records = await selected.Select(item => new {
            item.Id, item.Number, item.Text, item.Notes, item.Status, item.IsForInformation, item.MeetingDate, item.DueDate,
            reportsCount = db.ResolutionReports.Count(report => report.ResolutionId == item.Id) + item.Progress.Count(progress => progress.ReportText != "" && !db.ResolutionReports.Any(report => report.ResolutionId == item.Id && report.NationalId == progress.NationalId)),
            followups = item.Events.Count(entry => entry.Text.StartsWith(EventPrefix)),
            lastFollowup = item.Events.Where(entry => entry.Text.StartsWith(EventPrefix)).Max(entry => (DateTimeOffset?)entry.CreatedAt),
            completedAt = db.ResolutionReports.Where(report => report.ResolutionId == item.Id && report.ReportType == "completion").Max(report => (DateTimeOffset?)report.SubmittedAt) ?? item.UpdatedAt,
            groups = item.GroupAssignments.Select(group => group.Group!.Name).ToList(),
            legacyGroup = item.Group == null ? "" : item.Group.Name,
            people = item.Assignments.Select(person => person.NationalId).ToList(), item.PublishToAll
        }).AsSplitQuery().ToListAsync(ct);
        var personIds = records.SelectMany(item => item.people).Distinct().ToList();
        var names = await db.Users.Where(user => personIds.Contains(user.NationalId)).ToDictionaryAsync(user => user.NationalId, user => user.DisplayName, ct);
        var items = records.Select(item => {
            var metadata = Resolution.FromStoredNotes(item.Notes);
            var closed = item.IsForInformation || item.Status is "completed" or "cancelled";
            var reference = item.Status == "completed" && item.completedAt.HasValue ? DateOnly.FromDateTime(item.completedAt.Value.ToOffset(TimeSpan.FromHours(3.5)).DateTime) : today;
            var elapsed = item.DueDate.HasValue ? reference.DayNumber - item.DueDate.Value.DayNumber : 0;
            return new { item.Id, item.Number, item.Text, item.reportsCount, category = metadata.MinisterCategory, priority = metadata.Priority, notes = metadata.Notes, item.Status, item.IsForInformation, item.MeetingDate, item.DueDate, item.followups, item.lastFollowup,
                overdueDays = item.IsForInformation || item.Status == "cancelled" ? (int?)0 : item.Status == "completed" && !item.completedAt.HasValue ? null : Math.Max(0, elapsed),
                remainingDays = closed || !item.DueDate.HasValue ? (int?)null : Math.Max(0, -elapsed),
                routing = item.PublishToAll ? "همه کاربران" : string.Join("، ", item.groups.Append(item.legacyGroup).Concat(item.people.Select(id => names.GetValueOrDefault(id, id))).Where(value => value != "").Distinct()) };
        });
        return Results.Ok(new { generatedAt = DateTimeOffset.UtcNow, today, scopeProvince = context.User.IsInRole(AdminAccess.MinisterLiaison) ? context.User.FindFirstValue("minister-province") : null, summary = counts, total = counts?.total ?? 0, page, items });
    }
}
