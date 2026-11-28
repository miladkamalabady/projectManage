using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Vezarati.Api.Models;

static class DataQualityReport
{
    public static IQueryable<Resolution> Active(AppDb db, ClaimsPrincipal user) =>
        AdminAccess.Filter(db.Resolutions.AsNoTracking(), user, db).Where(item => !item.IsArchived && item.Status != "cancelled");

    public static IQueryable<string> AssignedIds(AppDb db, IQueryable<Resolution> active)
    {
        var groupIds = active.Where(item => item.GroupId.HasValue).Select(item => item.GroupId!.Value)
            .Union(active.SelectMany(item => item.GroupAssignments.Select(assignment => assignment.GroupId)));
        return active.SelectMany(item => item.Assignments.Select(assignment => assignment.NationalId))
            .Union(active.SelectMany(item => item.Progress.Select(progress => progress.NationalId)))
            .Union(db.GroupMembers.Where(member => groupIds.Contains(member.GroupId)).Select(member => member.NationalId))
            .Where(id => id != null && id.Trim() != "");
    }

    public static IQueryable<Resolution> WithoutSpecificAssignees(AppDb db, IQueryable<Resolution> active) =>
        active.Where(item =>
            !item.Assignments.Any(person => person.NationalId != null && person.NationalId.Trim() != "") &&
            !item.Progress.Any(person => person.NationalId != null && person.NationalId.Trim() != "") &&
            !db.GroupMembers.Any(member => member.NationalId != null && member.NationalId.Trim() != "" &&
                (member.GroupId == item.GroupId || item.GroupAssignments.Any(assignment => assignment.GroupId == member.GroupId))));

    public static async Task<IResult> Read(HttpContext context, AppDb db)
    {
        if (!AdminAccess.IsAdmin(context.User)) return Results.Forbid();
        var ct = context.RequestAborted;
        var users = db.Users.AsNoTracking();
        var active = Active(db, context.User);
        var missingMobiles = users.Where(user => user.Mobile == null || user.Mobile.Trim() == "");
        var withoutDueDate = active.Where(item => !item.DueDate.HasValue);
        var withoutSpecific = WithoutSpecificAssignees(db, active);
        // Keep counts and membership checks in SQL; never materialize complete users,
        // resolution bodies, progress or multiple collection joins for this report.
        var assignedIds = AssignedIds(db, active);
        var publicAssignment = await active.AnyAsync(item => item.PublishToAll, ct);
        var withoutTasks = publicAssignment ? users.Where(_ => false) : users.Where(user => !assignedIds.Contains(user.NationalId));
        var userCounts = await users.GroupBy(_ => 1).Select(group => new {
            total = group.Count(), withoutMobile = group.Count(user => user.Mobile == null || user.Mobile.Trim() == "")
        }).SingleOrDefaultAsync(ct);
        var usersTotal = userCounts?.total ?? 0;
        var usersWithoutMobileCount = userCounts?.withoutMobile ?? 0;
        var usersWithoutTasksCount = publicAssignment ? 0 : await withoutTasks.CountAsync(ct);
        var resolutionCounts = await active.GroupBy(_ => 1).Select(group => new {
            total = group.Count(), withoutDueDate = group.Count(item => !item.DueDate.HasValue)
        }).SingleOrDefaultAsync(ct);
        var resolutionsTotal = resolutionCounts?.total ?? 0;
        var resolutionsWithoutDueDateCount = resolutionCounts?.withoutDueDate ?? 0;
        var resolutionsWithoutSpecificAssigneesCount = await withoutSpecific.CountAsync(ct);
        var usersWithoutMobile = usersWithoutMobileCount == 0 ? [] : await UserSamples(missingMobiles).ToListAsync(ct);
        var usersWithoutTasks = usersWithoutTasksCount == 0 ? [] : await UserSamples(withoutTasks).ToListAsync(ct);
        var resolutionsWithoutDueDate = resolutionsWithoutDueDateCount == 0 ? [] : await ResolutionSamples(withoutDueDate).ToListAsync(ct);
        var resolutionsWithoutSpecificAssignees = resolutionsWithoutSpecificAssigneesCount == 0 ? [] : await ResolutionSamples(withoutSpecific).ToListAsync(ct);
        return Results.Ok(new {
            checkedAt = DateTimeOffset.UtcNow, usersTotal, usersWithoutMobileCount, usersWithoutMobile,
            usersWithoutTasksCount, usersWithoutTasks, resolutionsTotal, resolutionsWithoutDueDateCount,
            resolutionsWithoutDueDate, resolutionsWithoutSpecificAssigneesCount, resolutionsWithoutSpecificAssignees
        });
    }

    public sealed record UserSample(string DisplayName, string Title, string OrganizationUnit);
    public sealed record ResolutionSample(int Id, string Number, string Text, DateOnly? DueDate, DateOnly MeetingDate);
    public static IQueryable<UserSample> UserSamples(IQueryable<AppUser> query) => query.OrderBy(user => user.DisplayName).ThenBy(user => user.NationalId).Take(40)
        .Select(user => new UserSample(user.DisplayName, user.Title == null || user.Title.Trim() == "" ? user.OrgPositionDesc ?? "" : user.Title, user.OrganizationUnit));
    public static IQueryable<ResolutionSample> ResolutionSamples(IQueryable<Resolution> query) => query.OrderByDescending(item => item.Id).Take(40)
        .Select(item => new ResolutionSample(item.Id, item.Number, item.Text, item.DueDate, item.MeetingDate));
}
