using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Vezarati.Api.Models;

static class AdminStatus
{
    public sealed record TaskRow(int Id, string Number, string Status, DateOnly Date, string DateJalali, DateOnly? DueDate,
        bool PublishToAll, int? GroupId, string Notes);
    public sealed record Person(string NationalId, string DisplayName, string? Title, string OrganizationUnit);
    public sealed record State(string NationalId, string Status, bool HasReport);
    public sealed record Entry(TaskRow Task, List<State> People);
    public sealed record Data(List<Entry> Entries, Dictionary<string, Person> People);

    public static async Task<Data> Read(AppDb db, ClaimsPrincipal user, string? type, string? priority, DateOnly? from,
        DateOnly? to, string? province, int? unit, CancellationToken ct, int? targetId = null)
    {
        var query = AdminAccess.Filter(db.Resolutions.AsNoTracking(), user, db).Where(item => !item.IsForInformation && !item.IsArchived && item.Status != "cancelled" && !item.IsCommitteeDraft);
        if (targetId.HasValue) query = query.Where(item => item.Id == targetId.Value);
        query = type switch
        {
            "standard" => query.Where(item => !item.IsSpecialTracking),
            "minister" => query.Where(item => item.IsSpecialTracking && item.SpecialTrackingType != "provincial"),
            "provincial" => query.Where(item => item.IsSpecialTracking && item.SpecialTrackingType == "provincial"),
            _ => query
        };
        if (from.HasValue) query = query.Where(item => item.MeetingDate >= from.Value);
        if (to.HasValue) query = query.Where(item => item.MeetingDate <= to.Value);
        if (priority is "آنی" or "فوری")
        {
            var marker = "\u001Fpriority:" + Uri.EscapeDataString(priority);
            query = query.Where(item => item.Notes.Contains(marker));
        }
        else if (priority == "عادی") query = query.Where(item => !item.Notes.Contains("priority:"));
        var tasks = await query.Select(item => new TaskRow(item.Id, item.Number, item.Status, item.MeetingDate,
            item.MeetingDateJalali, item.DueDate, item.PublishToAll, item.GroupId, province != null && province != "" ? item.Notes : "")).ToListAsync(ct);
        var people = await db.Users.AsNoTracking().Select(user => new Person(user.NationalId, user.DisplayName, user.Title, user.OrganizationUnit)).ToDictionaryAsync(user => user.NationalId, ct);
        var memberships = await db.GroupMembers.AsNoTracking().Select(member => new { member.GroupId, member.NationalId }).ToListAsync(ct);
        var links = await query.SelectMany(item => item.GroupAssignments.Select(group => new { ResolutionId = item.Id, group.GroupId })).ToListAsync(ct);
        var assigned = await query.SelectMany(item => item.Assignments.Select(person => new { ResolutionId = item.Id, person.NationalId })).ToListAsync(ct);
        var progress = await query.SelectMany(item => item.Progress.Select(person => new { ResolutionId = item.Id, person.NationalId, person.Status, HasReport = person.ReportText != "" })).ToListAsync(ct);
        var reports = await db.ResolutionReports.AsNoTracking().Where(report => query.Select(item => item.Id).Contains(report.ResolutionId))
            .Select(report => new { report.ResolutionId, report.NationalId }).Distinct().ToListAsync(ct);
        var reported = reports.Select(report => (report.ResolutionId, report.NationalId)).ToHashSet();
        var progressByPerson = progress.ToDictionary(person => (person.ResolutionId, person.NationalId));
        var membersByGroup = memberships.ToLookup(member => member.GroupId, member => member.NationalId);
        var linksByTask = links.ToLookup(link => link.ResolutionId, link => link.GroupId);
        var assignedByTask = assigned.ToLookup(person => person.ResolutionId, person => person.NationalId);
        HashSet<string>? unitPeople = null;
        if (unit.HasValue)
        {
            var unitName = await db.Groups.Where(group => group.Id == unit.Value).Select(group => group.Name).FirstOrDefaultAsync(ct);
            unitPeople = membersByGroup[unit.Value].Concat(people.Values.Where(person => unitName != null && person.OrganizationUnit == unitName).Select(person => person.NationalId)).ToHashSet();
        }
        var result = new List<Entry>();
        foreach (var task in tasks)
        {
            var groupIds = linksByTask[task.Id].ToHashSet();
            if (task.GroupId.HasValue) groupIds.Add(task.GroupId.Value);
            var ids = assignedByTask[task.Id].Concat(groupIds.SelectMany(group => membersByGroup[group])).ToHashSet();
            if (task.PublishToAll) ids.UnionWith(people.Keys);
            var states = ids.Select(id => {
                progressByPerson.TryGetValue((task.Id, id), out var saved);
                return new State(id, saved?.Status ?? task.Status,
                    saved?.HasReport == true || reported.Contains((task.Id, id)));
            }).ToList();
            if (unit.HasValue && !groupIds.Contains(unit.Value) && !ids.Any(id => unitPeople!.Contains(id))) continue;
            if (!string.IsNullOrWhiteSpace(province))
            {
                var metadata = Resolution.FromStoredNotes(task.Notes);
                if (metadata.Province != province && !ids.Any(id => people.TryGetValue(id, out var person) &&
                    ((person.OrganizationUnit ?? "").Contains(province) || (person.Title?.Contains(province) ?? false)))) continue;
            }
            result.Add(new(task, states));
        }
        return new(result, people);
    }

    private static bool Overdue(Entry entry, State? person = null) => entry.Task.DueDate < ProvincialTrips.CurrentDate &&
        (person is null ? !Done(entry) : person.Status != "completed");
    private static bool Done(Entry entry) => entry.People.Count > 0 ? entry.People.All(person => person.Status == "completed") : entry.Task.Status == "completed";
    private static string Normalize(string value) => value.Normalize(System.Text.NormalizationForm.FormKC).Replace("ي", "ی").Replace("ى", "ی").Replace("ك", "ک").Replace("‌", " ").Trim();
    private static bool Matches(Entry entry, string? status) => status switch
    {
        "completed" => Done(entry), "remaining" => !Done(entry), "overdue" => Overdue(entry), _ => true
    };
    private static bool PersonMatches(Entry entry, State person, string? status) => status switch
    {
        "completed" => person.Status == "completed", "remaining" => person.Status != "completed", "overdue" => Overdue(entry, person), _ => true
    };

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/dashboard/status", ReadStatus);
        app.MapGet("/api/dashboard/status/options", async (HttpContext context, AppDb db) => {
            if (!AdminAccess.IsAdmin(context.User)) return Results.Forbid();
            return Results.Ok(await db.Groups.AsNoTracking().OrderBy(group => group.Name)
                .Select(group => new { group.Id, group.Name }).ToListAsync(context.RequestAborted));
        });
        app.MapGet("/api/dashboard/status/reports", async (HttpContext context, AppDb db, int resolutionId, string nationalId) =>
        {
            if (!AdminAccess.IsAdmin(context.User)) return Results.Forbid();
            var data = await Read(db, context.User, null, null, null, null, null, null, context.RequestAborted, resolutionId);
            if (!data.Entries.Any(entry => entry.Task.Id == resolutionId && entry.People.Any(person => person.NationalId == nationalId)))
                return Results.NotFound();
            return await DashboardTasks.ReadPersonReports(db, resolutionId, [nationalId], context.RequestAborted);
        });
    }

    public static async Task<IResult> ReadStatus(HttpContext context, AppDb db, string? view, string? q,
        string? type, string? status, string? priority, DateOnly? from, DateOnly? to, string? province, int? unit,
        int? resolutionId, string? personId, int page = 1)
    {
        if (!AdminAccess.IsAdmin(context.User)) return Results.Forbid();
        if (view is not (null or "resolutions" or "people" or "participants" or "person-tasks") ||
            status is not (null or "" or "all" or "completed" or "remaining" or "overdue") ||
            type is not (null or "" or "all" or "standard" or "minister" or "provincial") ||
            priority is not (null or "" or "عادی" or "فوری" or "آنی") || (from.HasValue && to.HasValue && from > to)) return Results.BadRequest();
        var ct = context.RequestAborted;
        var data = await Read(db, context.User, type, priority, from, to, province, unit, ct, view == "participants" ? resolutionId : null);
        var safePage = Math.Max(1, page);
        var summary = new { total = data.Entries.Count, completed = data.Entries.Count(Done),
            remaining = data.Entries.Count(entry => !Done(entry)), overdue = data.Entries.Count(entry => Overdue(entry)) };
        var term = Normalize(q ?? "");
        if (view == "participants")
        {
            var entry = data.Entries.FirstOrDefault(entry => entry.Task.Id == resolutionId);
            if (entry is null) return Results.NotFound();
            var people = entry.People.Select(state => new {
                state.NationalId, displayName = data.People.GetValueOrDefault(state.NationalId)?.DisplayName ?? state.NationalId,
                title = data.People.GetValueOrDefault(state.NationalId)?.Title ?? "", state.Status, state.HasReport,
                overdue = Overdue(entry, state)
            }).OrderBy(person => person.Status == "completed").ThenBy(person => person.displayName).ToList();
            return Results.Ok(new { summary, total = people.Count, page = safePage, items = people.Skip((safePage-1)*50).Take(50) });
        }
        if (view == "people")
        {
            var people = data.Entries.SelectMany(entry => entry.People.Select(person => new { entry, person }))
                .GroupBy(row => row.person.NationalId).Select(group => new {
                    nationalId = group.Key, displayName = data.People.GetValueOrDefault(group.Key)?.DisplayName ?? group.Key,
                    title = data.People.GetValueOrDefault(group.Key)?.Title ?? "",
                    total = group.Count(), completed = group.Count(row => row.person.Status == "completed"),
                    remaining = group.Count(row => row.person.Status != "completed"), overdue = group.Count(row => Overdue(row.entry, row.person))
                }).Where(person => (status != "completed" || person.completed > 0) && (status != "remaining" || person.remaining > 0) && (status != "overdue" || person.overdue > 0) &&
                    (term.Length == 0 || Normalize(person.displayName + " " + person.title + " " + person.nationalId).Contains(term)))
                .OrderByDescending(person => person.overdue).ThenByDescending(person => person.remaining).ThenBy(person => person.nationalId).ToList();
            return Results.Ok(new { summary, total = people.Count, page = safePage, items = people.Skip((safePage-1)*50).Take(50) });
        }
        var matching = data.Entries.Where(entry => view == "person-tasks"
            ? entry.People.Any(person => person.NationalId == personId && PersonMatches(entry, person, status))
            : Matches(entry, status)).ToList();
        if (term.Length > 0)
        {
            var scope = AdminAccess.Filter(db.Resolutions.AsNoTracking(), context.User, db);
            var ids = await scope.Where(item => item.Text.Contains(q!) || item.Number.Contains(q!) || item.Id.ToString() == q)
                .Select(item => item.Id).ToListAsync(ct);
            var matchingPeople = data.People.Values.Where(person => Normalize(person.DisplayName + " " + person.NationalId).Contains(term)).Select(person => person.NationalId).ToHashSet();
            matching = matching.Where(entry => ids.Contains(entry.Task.Id) || entry.People.Any(person => matchingPeople.Contains(person.NationalId))).ToList();
        }
        var pageEntries = matching.OrderByDescending(entry => Overdue(entry)).ThenByDescending(entry => entry.Task.Date).ThenByDescending(entry => entry.Task.Id)
            .Skip((safePage-1)*50).Take(50).ToList();
        var pageIds = pageEntries.Select(entry => entry.Task.Id).ToList();
        var titles = await AdminAccess.Filter(db.Resolutions.AsNoTracking(), context.User, db).Where(item => pageIds.Contains(item.Id))
            .ToDictionaryAsync(item => item.Id, item => item.Text, ct);
        return Results.Ok(new { summary, total = matching.Count, page = safePage, items = pageEntries.Select(entry => {
            var personal = view == "person-tasks" ? entry.People.First(person => person.NationalId == personId) : null;
            return new {
                id = entry.Task.Id, number = entry.Task.Number, text = titles.GetValueOrDefault(entry.Task.Id, ""),
                dueDate = entry.Task.DueDate, assigned = entry.People.Count,
                completed = entry.People.Count(person => person.Status == "completed"),
                remaining = entry.People.Count(person => person.Status != "completed"),
                status = personal?.Status ?? (Done(entry) ? "completed" : entry.Task.Status),
                hasReport = personal?.HasReport ?? entry.People.Any(person => person.HasReport), overdue = Overdue(entry, personal)
            };
        }) });
    }
}
