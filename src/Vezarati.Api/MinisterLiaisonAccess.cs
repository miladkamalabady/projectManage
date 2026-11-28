using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Vezarati.Api.Models;

static class MinisterLiaisonAccess
{
    public static IQueryable<string> People(AppDb db, string province)
    {
        var token = " " + province + " ";
        var namedGroups = NamedGroups(db, province);
        return db.Users.Where(person =>
            ((" " + (person.Title ?? "") + " " + (person.OrgPositionDesc ?? "") + " " + person.OrganizationUnit + " ")
                .Replace("‌", " ").Replace("،", " ").Replace(",", " ").Replace("(", " ").Replace(")", " ").Replace("ي", "ی").Replace("ك", "ک")).Contains(token) ||
            (person.Role == AdminAccess.MinisterLiaison && person.MinisterLiaisonProvince == province))
            .Select(person => person.NationalId)
            .Union(db.GroupMembers.Where(member => namedGroups.Contains(member.GroupId)).Select(member => member.NationalId));
    }

    public static IQueryable<int> NamedGroups(AppDb db, string province)
    {
        var token = " " + province + " ";
        return db.Groups.Where(group => (" " + group.Name + " ").Replace("‌", " ").Replace("،", " ").Replace(",", " ")
            .Replace("(", " ").Replace(")", " ").Replace("ي", "ی").Replace("ك", "ک").Contains(token)).Select(group => group.Id);
    }

    public static IQueryable<int> Groups(AppDb db, string province)
    {
        var namedGroups = NamedGroups(db, province);
        var people = People(db, province);
        return db.Groups.Where(group => namedGroups.Contains(group.Id) ||
            db.GroupMembers.Any(member => member.GroupId == group.Id && people.Contains(member.NationalId))).Select(group => group.Id);
    }

    public static IQueryable<Resolution> Filter(IQueryable<Resolution> query, ClaimsPrincipal user, AppDb db)
    {
        var province = user.FindFirstValue("minister-province");
        if (string.IsNullOrWhiteSpace(province)) return query.Where(_ => false);
        var people = People(db, province);
        var groups = Groups(db, province);
        return query.Where(item => item.IsSpecialTracking && item.SpecialTrackingType != "provincial" &&
            (item.PublishToAll || item.Assignments.Any(person => people.Contains(person.NationalId)) ||
                (item.GroupId.HasValue && groups.Contains(item.GroupId.Value)) ||
                item.GroupAssignments.Any(group => groups.Contains(group.GroupId))));
    }

    public static Task<bool> CanRespond(AppDb db, ClaimsPrincipal user, int resolutionId) =>
        user.IsInRole(AdminAccess.MinisterLiaison)
            ? Filter(db.Resolutions.AsNoTracking(), user, db).AnyAsync(item => item.Id == resolutionId && !item.IsForInformation)
            : Task.FromResult(false);
}
