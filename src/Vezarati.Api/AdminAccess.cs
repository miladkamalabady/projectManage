using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Vezarati.Api.Models;

static class AdminAccess
{
    public const string MinisterLiaison = "رابط استانی دستورات ویژه وزیر";
    public const string Council = "ادمین مصوبات شورای معاونین";
    public const string Full = "ادمین";
    public const string Provincial = "ادمین استانی";
    public const string Minister = "ادمین دستورات ویژه وزیر";
    public static bool IsAdmin(ClaimsPrincipal user) => IsAdminRole(user.FindFirstValue(ClaimTypes.Role));
    public static bool IsAdminRole(string? role) => role is Full or Provincial or Minister or Council or MinisterLiaison;
    public static string? Scope(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.Role) switch
    {
        MinisterLiaison => "minister-liaison", Council => "council", Provincial => "provincial", Minister => "minister", _ => null
    };
    public static IQueryable<Resolution> Filter(IQueryable<Resolution> query, ClaimsPrincipal user, AppDb db)
    {
        var scope = Scope(user);
        if (scope == "minister-liaison") return MinisterLiaisonAccess.Filter(query, user, db);
        return scope is null ? query : scope == "council" ? query.Where(item => !item.IsSpecialTracking) : scope == "provincial"
            ? query.Where(item => item.IsSpecialTracking && item.SpecialTrackingType == "provincial")
            : query.Where(item => item.IsSpecialTracking && item.SpecialTrackingType != "provincial");
    }

    public static async Task<bool> CanRequest(HttpContext context, AppDb db)
    {
        var scope = Scope(context.User);
        if (scope is null) return true;
        var path = context.Request.Path.Value ?? "";
        var read = HttpMethods.IsGet(context.Request.Method);
        if (path.StartsWith("/api/auth/") || path.StartsWith("/api/push/")) return true;
        if (read && (path is "/api/dashboard" or "/api/resolutions" or "/api/groups" or "/api/users" or "/api/users/search" or "/api/reports/submissions")) return true;
        if (scope == "council" && (path.StartsWith("/api/meetings") || path.StartsWith("/api/attendance") ||
            (read && (path == "/api/reports" || path.StartsWith("/api/reports/people/"))))) return true;
        if (read && path == "/api/reports/minister-status") return scope is "minister" or "minister-liaison";
        if (read && context.Request.Path.StartsWithSegments("/api/dashboard/status")) return scope == "council";
        if (read && (path == "/api/dashboard/tasks" || path == "/api/dashboard/task-reports")) return scope == "council";
        if (path.StartsWith("/api/provincial-trips") || path.StartsWith("/api/provincial-poles")) return scope == "provincial";
        if (path == "/api/settings/minister-directive-categories") return scope == "minister" || (scope == "minister-liaison" && read);
        if (path == "/api/resolutions" && HttpMethods.IsPost(context.Request.Method))
            return await MatchesBody(context, scope, db);
        var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        int? resolutionId = null;
        if (segments.Length >= 3 && segments[1] == "resolutions" && int.TryParse(segments[2], out var id))
        {
            resolutionId = id;
            if (HttpMethods.IsPut(context.Request.Method) && !await MatchesBody(context, scope, db)) return false;
        }
        else if (segments.Length >= 3 && segments[1] == "attachments" && int.TryParse(segments[2], out var attachmentId))
            resolutionId = await db.Attachments.Where(item => item.Id == attachmentId).Select(item => (int?)item.ResolutionId).FirstOrDefaultAsync();
        else if (segments.Length >= 4 && segments[1] == "reports" && segments[2] == "submissions" && int.TryParse(segments[3], out var reportId))
            resolutionId = await db.ResolutionReports.Where(item => item.Id == reportId).Select(item => (int?)item.ResolutionId).FirstOrDefaultAsync();
        return resolutionId.HasValue && await Filter(db.Resolutions, context.User, db).AnyAsync(item => item.Id == resolutionId.Value);
    }

    private static async Task<bool> MatchesBody(HttpContext context, string scope, AppDb db)
    {
        context.Request.EnableBuffering();
        try
        {
            using var json = await JsonDocument.ParseAsync(context.Request.Body, cancellationToken: context.RequestAborted);
            var root = json.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return false;
            if (scope == "council")
                return !root.TryGetProperty("isSpecialTracking", out var councilSpecial) || councilSpecial.ValueKind == JsonValueKind.False;
            if (scope == "minister-liaison")
            {
                var province = context.User.FindFirstValue("minister-province");
                if (string.IsNullOrWhiteSpace(province) ||
                    !root.TryGetProperty("isSpecialTracking", out var liaisonSpecial) || liaisonSpecial.ValueKind != JsonValueKind.True ||
                    !root.TryGetProperty("specialTrackingType", out var liaisonType) || liaisonType.GetString() != "minister") return false;
                if (root.TryGetProperty("publishToAll", out var everyone) && everyone.ValueKind == JsonValueKind.True) return false;
                var groupIds = new List<int>();
                if (root.TryGetProperty("groupIds", out var groups) && groups.ValueKind == JsonValueKind.Array)
                    foreach (var group in groups.EnumerateArray()) { if (group.ValueKind != JsonValueKind.Number || !group.TryGetInt32(out var groupId)) return false; groupIds.Add(groupId); }
                if (root.TryGetProperty("groupId", out var legacyGroup) && legacyGroup.ValueKind == JsonValueKind.Number && legacyGroup.TryGetInt32(out var legacyId)) groupIds.Add(legacyId);
                var people = root.TryGetProperty("people", out var recipients) && recipients.ValueKind == JsonValueKind.Array
                    ? recipients.EnumerateArray().Where(item => item.ValueKind == JsonValueKind.String).Select(item => item.GetString()!).ToList() : [];
                if (groupIds.Count + people.Count == 0) return false;
                var eligiblePeople = MinisterLiaisonAccess.People(db, province);
                var namedGroups = MinisterLiaisonAccess.NamedGroups(db, province);
                var eligibleGroups = db.Groups.Where(group => namedGroups.Contains(group.Id) ||
                    (db.GroupMembers.Any(member => member.GroupId == group.Id) &&
                     !db.GroupMembers.Any(member => member.GroupId == group.Id && !eligiblePeople.Contains(member.NationalId)))).Select(group => group.Id);
                var allowedGroupIds = await eligibleGroups.Where(id => groupIds.Contains(id)).ToListAsync(context.RequestAborted);
                var allowedPeople = await eligiblePeople.Where(id => people.Contains(id)).ToListAsync(context.RequestAborted);
                return groupIds.All(allowedGroupIds.Contains) && people.All(allowedPeople.Contains);
            }
            return root.TryGetProperty("isSpecialTracking", out var special) && special.ValueKind == JsonValueKind.True &&
                root.TryGetProperty("specialTrackingType", out var type) && type.GetString() == scope;
        }
        catch (JsonException) { return false; }
        finally { context.Request.Body.Position = 0; }
    }
}
