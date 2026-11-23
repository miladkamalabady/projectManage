using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Vezarati.Api.Models;

static class DashboardTasks
{
    public sealed record TaskState(int Id, bool Done);
    public sealed record Row(string Id, string Label, string Detail, List<TaskState> Items)
    {
        public object Summary => new { Id, Label, Detail, Completed = Items.Count(item => item.Done), Remaining = Items.Count(item => !item.Done) };
    }
    public sealed record Snapshot(List<Row> Units, List<Row> Directors);
    private static string Normalize(string value) => value.Replace("‌", "").Replace(" ", "").Replace("،", "").Replace(",", "").Replace("ي", "ی").Replace("ك", "ک");
    private static bool IsUnit(string name, string category) => !name.StartsWith("آقای ") &&
        (category == "unit" || (category != "group" && !new[] { "شورای معاونان", "مدیران کل", "تهران، شهرستان های تهران", "تهران،قم، خراسان", "هرمزگان، بوشهر، خوزستان، سیستان" }.Any(item => Normalize(item) == Normalize(name))));

    // Only identifiers and execution states are read. Resolution text, files, events and report bodies stay out of the statistics query.
    public static async Task<Snapshot> Read(AppDb db, ClaimsPrincipal user, CancellationToken ct)
    {
        var query = AdminAccess.Filter(db.Resolutions.AsNoTracking(), user)
            .Where(item => !item.IsArchived && !item.IsSpecialTracking && item.Status != "cancelled");
        var records = await query.Select(item => new { item.Id, item.Status, item.PublishToAll }).ToListAsync(ct);
        var groups = await db.Groups.AsNoTracking().Select(item => new { item.Id, item.Name, item.Category }).ToListAsync(ct);
        var members = await db.GroupMembers.AsNoTracking().Select(item => new { item.GroupId, item.NationalId }).ToListAsync(ct);
        var users = await db.Users.AsNoTracking().Select(item => new { item.NationalId, item.DisplayName, item.Title, item.OrganizationUnit }).ToListAsync(ct);
        var links = await query.SelectMany(item => item.GroupAssignments.Select(link => new { ResolutionId = item.Id, link.GroupId }))
            .Union(query.Where(item => item.GroupId != null).Select(item => new { ResolutionId = item.Id, GroupId = item.GroupId!.Value })).ToListAsync(ct);
        var assignments = await query.SelectMany(item => item.Assignments.Select(person => new { ResolutionId = item.Id, person.NationalId })).ToListAsync(ct);
        var progress = await query.SelectMany(item => item.Progress.Select(person => new { ResolutionId = item.Id, person.NationalId, person.Status })).ToListAsync(ct);
        var groupMembers = members.ToLookup(member => member.GroupId, member => member.NationalId);
        var linksByResolution = links.ToLookup(link => link.ResolutionId, link => link.GroupId);
        var assignedByResolution = assignments.ToLookup(person => person.ResolutionId, person => person.NationalId);
        var progressByPerson = progress.ToDictionary(person => (person.ResolutionId, person.NationalId), person => person.Status);
        var units = groups.Where(group => IsUnit(group.Name, group.Category)).ToList();
        var unitsByPerson = new Dictionary<string, HashSet<int>>();
        foreach (var unit in units)
        {
            var people = groupMembers[unit.Id].Concat(users.Where(person => Normalize(person.OrganizationUnit ?? "") == Normalize(unit.Name)).Select(person => person.NationalId)).Distinct();
            foreach (var person in people)
            {
                if (!unitsByPerson.TryGetValue(person, out var ids)) unitsByPerson[person] = ids = [];
                ids.Add(unit.Id);
            }
        }
        var directorIds = groups.Where(group => Normalize(group.Name) == Normalize("مدیران کل"))
            .SelectMany(group => groupMembers[group.Id]).Distinct().ToList();
        var directory = users.ToDictionary(person => person.NationalId);
        var unitRows = units.ToDictionary(unit => unit.Id, unit => new Row(unit.Id.ToString(), unit.Name, "", []));
        var directorRows = directorIds.ToDictionary(id => id, id => new Row(id,
            directory.TryGetValue(id, out var person) ? person.DisplayName : id, directory.GetValueOrDefault(id)?.Title ?? "", []));
        foreach (var record in records)
        {
            var groupIds = linksByResolution[record.Id].ToHashSet();
            var recipients = assignedByResolution[record.Id].Concat(groupIds.SelectMany(id => groupMembers[id])).ToHashSet();
            if (record.PublishToAll) recipients.UnionWith(directory.Keys.Concat(directorIds));
            var unitStates = new Dictionary<int, bool>();
            foreach (var person in recipients)
            {
                var done = progressByPerson.GetValueOrDefault((record.Id, person), record.Status) == "completed";
                if (directorRows.TryGetValue(person, out var director)) director.Items.Add(new(record.Id, done));
                foreach (var unitId in unitsByPerson.GetValueOrDefault(person) ?? [])
                    unitStates[unitId] = unitStates.GetValueOrDefault(unitId, true) && done;
            }
            foreach (var groupId in groupIds)
                if (unitRows.ContainsKey(groupId)) unitStates.TryAdd(groupId, record.Status == "completed");
            foreach (var (unitId, done) in unitStates) unitRows[unitId].Items.Add(new(record.Id, done));
        }
        return new(unitRows.Values.OrderByDescending(row => row.Items.Count(item => !item.Done)).ThenBy(row => row.Label).ToList(),
            directorRows.Values.OrderByDescending(row => row.Items.Count(item => !item.Done)).ThenBy(row => row.Label).ToList());
    }

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/dashboard/tasks", async (HttpContext context, AppDb db, string kind, string id, string? status, int page = 1) =>
        {
            if (!AdminAccess.IsAdmin(context.User)) return Results.Forbid();
            if (kind is not ("units" or "directors") || status is not (null or "all" or "completed" or "remaining")) return Results.BadRequest();
            var snapshot = await Read(db, context.User, context.RequestAborted);
            var row = (kind == "units" ? snapshot.Units : snapshot.Directors).FirstOrDefault(row => row.Id == id);
            if (row is null) return Results.NotFound();
            var matching = row.Items.Where(item => status is null or "all" || item.Done == (status == "completed")).ToList();
            var ids = matching.Select(item => item.Id).ToList();
            var safePage = Math.Max(1, page);
            var items = await AdminAccess.Filter(db.Resolutions.AsNoTracking(), context.User).Where(item => ids.Contains(item.Id))
                .OrderByDescending(item => item.MeetingDate).ThenByDescending(item => item.Id).Skip((safePage - 1) * 50).Take(50)
                .Select(item => new { item.Id, item.Number, item.Text, item.MeetingDate, item.MeetingDateJalali, item.DueDate, item.DueDateJalali })
                .ToListAsync(context.RequestAborted);
            var states = matching.ToDictionary(item => item.Id, item => item.Done);
            return Results.Ok(new { total = matching.Count, page = safePage, items = items.Select(item => new { item, done = states[item.Id] }) });
        });
        app.MapGet("/api/dashboard/task-reports", ReadReports);
        app.MapGet("/api/resolutions/{id:int}", async (int id, HttpContext context, AppDb db) =>
        {
            if (!AdminAccess.IsAdmin(context.User)) return Results.Forbid();
            var item = await AdminAccess.Filter(db.Resolutions.AsNoTracking(), context.User).Where(item => item.Id == id)
                .AsSplitQuery().Include(item => item.Assignments).Include(item => item.GroupAssignments).Include(item => item.Progress)
                .Include(item => item.Attachments).Include(item => item.Events).Include(item => item.Meeting).ThenInclude(meeting => meeting!.Attachments)
                .FirstOrDefaultAsync(context.RequestAborted);
            if (item is null) return Results.NotFound();
            item.MeetingTitle = item.Meeting?.Title ?? "";
            item.MeetingAttachments = item.Meeting?.Attachments ?? [];
            return Results.Ok(item);
        });
    }
    public static async Task<IResult> ReadReports(HttpContext context, AppDb db, string kind, string id, int resolutionId)
    {
            if (!AdminAccess.IsAdmin(context.User)) return Results.Forbid();
            if (kind is not ("units" or "directors")) return Results.BadRequest();
            var snapshot = await Read(db, context.User, context.RequestAborted);
            var row = (kind == "units" ? snapshot.Units : snapshot.Directors).FirstOrDefault(row => row.Id == id);
            if (row is null || !row.Items.Any(item => item.Id == resolutionId && item.Done)) return Results.NotFound();
            var people = new HashSet<string>();
            if (kind == "directors") people.Add(id);
            else
            {
                var unitId = int.Parse(id);
                var name = await db.Groups.Where(group => group.Id == unitId).Select(group => group.Name).FirstAsync(context.RequestAborted);
                people.UnionWith(await db.GroupMembers.Where(member => member.GroupId == unitId).Select(member => member.NationalId).ToListAsync(context.RequestAborted));
                var directory = await db.Users.AsNoTracking().Select(user => new { user.NationalId, user.OrganizationUnit }).ToListAsync(context.RequestAborted);
                people.UnionWith(directory.Where(user => Normalize(user.OrganizationUnit ?? "") == Normalize(name)).Select(user => user.NationalId));
            }
            var personIds = people.ToList();
            return await ReadPersonReports(db, resolutionId, personIds, context.RequestAborted);
    }

    public static async Task<IResult> ReadPersonReports(AppDb db, int resolutionId, List<string> personIds, CancellationToken ct)
    {
            var reports = await db.ResolutionReports.AsNoTracking().Where(report => report.ResolutionId == resolutionId && personIds.Contains(report.NationalId))
                .OrderByDescending(report => report.SubmittedAt).ThenByDescending(report => report.Id).ToListAsync(ct);
            var progress = await db.Progress.AsNoTracking().Where(item => item.ResolutionId == resolutionId && personIds.Contains(item.NationalId) && item.ReportText != "")
                .ToListAsync(ct);
            var files = await db.Attachments.AsNoTracking().Where(file => file.ResolutionId == resolutionId)
                .Select(file => new { file.Id, file.ResolutionReportId, file.UploadedBy, file.OriginalName }).ToListAsync(ct);
            var names = await db.Users.AsNoTracking().Where(user => personIds.Contains(user.NationalId))
                .ToDictionaryAsync(user => user.NationalId, user => user.DisplayName, ct);
            var items = reports.Select(report => new {
                key = "report-" + report.Id, userName = names.GetValueOrDefault(report.NationalId, report.UserName),
                text = report.Text, submittedAt = report.SubmittedAt, reportType = report.ReportType,
                attachments = files.Where(file => file.ResolutionReportId == report.Id).Select(file => new { file.Id, file.OriginalName }).ToList()
            }).ToList();
            var reportedIds = reports.Select(report => report.NationalId).ToHashSet();
            items.AddRange(progress.Where(item => !reportedIds.Contains(item.NationalId)).Select(item => new {
                key = "legacy-" + item.NationalId, userName = names.GetValueOrDefault(item.NationalId, item.NationalId),
                text = item.ReportText, submittedAt = item.UpdatedAt, reportType = "legacy",
                attachments = files.Where(file => file.ResolutionReportId == null && file.UploadedBy == item.NationalId).Select(file => new { file.Id, file.OriginalName }).ToList()
            }));
            return Results.Ok(items.OrderByDescending(item => item.submittedAt));
    }

}
