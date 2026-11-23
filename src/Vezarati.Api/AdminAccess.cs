using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Vezarati.Api.Models;

static class AdminAccess
{
    public const string Council = "ادمین مصوبات شورای معاونین";
    public const string Full = "ادمین";
    public const string Provincial = "ادمین استانی";
    public const string Minister = "ادمین دستورات ویژه وزیر";
    public static bool IsAdmin(ClaimsPrincipal user) => IsAdminRole(user.FindFirstValue(ClaimTypes.Role));
    public static bool IsAdminRole(string? role) => role is Full or Provincial or Minister or Council;
    public static string? Scope(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.Role) switch
    {
        Council => "council", Provincial => "provincial", Minister => "minister", _ => null
    };
    public static IQueryable<Resolution> Filter(IQueryable<Resolution> query, ClaimsPrincipal user)
    {
        var scope = Scope(user);
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
        if (read && path == "/api/dashboard/tasks") return scope == "council";
        if (path.StartsWith("/api/provincial-trips") || path.StartsWith("/api/provincial-poles")) return scope == "provincial";
        if (path == "/api/settings/minister-directive-categories") return scope == "minister";
        if (path == "/api/resolutions" && HttpMethods.IsPost(context.Request.Method))
            return await MatchesBody(context, scope);
        var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        int? resolutionId = null;
        if (segments.Length >= 3 && segments[1] == "resolutions" && int.TryParse(segments[2], out var id))
        {
            resolutionId = id;
            if (HttpMethods.IsPut(context.Request.Method) && !await MatchesBody(context, scope)) return false;
        }
        else if (segments.Length >= 3 && segments[1] == "attachments" && int.TryParse(segments[2], out var attachmentId))
            resolutionId = await db.Attachments.Where(item => item.Id == attachmentId).Select(item => (int?)item.ResolutionId).FirstOrDefaultAsync();
        else if (segments.Length >= 4 && segments[1] == "reports" && segments[2] == "submissions" && int.TryParse(segments[3], out var reportId))
            resolutionId = await db.ResolutionReports.Where(item => item.Id == reportId).Select(item => (int?)item.ResolutionId).FirstOrDefaultAsync();
        return resolutionId.HasValue && await Filter(db.Resolutions, context.User).AnyAsync(item => item.Id == resolutionId.Value);
    }

    private static async Task<bool> MatchesBody(HttpContext context, string scope)
    {
        context.Request.EnableBuffering();
        try
        {
            using var json = await JsonDocument.ParseAsync(context.Request.Body, cancellationToken: context.RequestAborted);
            var root = json.RootElement;
            if (scope == "council")
                return !root.TryGetProperty("isSpecialTracking", out var councilSpecial) || councilSpecial.ValueKind == JsonValueKind.False;
            return root.TryGetProperty("isSpecialTracking", out var special) && special.ValueKind == JsonValueKind.True &&
                root.TryGetProperty("specialTrackingType", out var type) && type.GetString() == scope;
        }
        catch (JsonException) { return false; }
        finally { context.Request.Body.Position = 0; }
    }
}
