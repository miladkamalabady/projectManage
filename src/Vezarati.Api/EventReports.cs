using Microsoft.EntityFrameworkCore;
using Vezarati.Api.Models;

static class EventReports
{
    public static bool IsActionReport(string text) => text.Contains("گزارش اقدام") && text.Contains("ثبت شد");
    public static async Task<IResult> Read(HttpContext context, AppDb db, int id, int eventId)
    {
        if (!AdminAccess.IsAdmin(context.User)) return Results.Forbid();
        var ct = context.RequestAborted;
        if (!await AdminAccess.Filter(db.Resolutions.AsNoTracking(), context.User).AnyAsync(item => item.Id == id, ct)) return Results.NotFound();
        var entry = await db.Events.AsNoTracking().Where(item => item.Id == eventId && item.ResolutionId == id)
            .Select(item => new { item.NationalId, item.UserName, item.Text, item.CreatedAt }).SingleOrDefaultAsync(ct);
        if (entry is null || !IsActionReport(entry.Text)) return Results.NotFound();
        // Completion reports and their events are saved in the same transaction with
        // the same timestamp. Never substitute another report by the same person.
        var report = await db.ResolutionReports.AsNoTracking().Where(item => item.ResolutionId == id &&
            item.NationalId == entry.NationalId && item.ReportType == "completion" && item.SubmittedAt == entry.CreatedAt)
            .OrderByDescending(item => item.Id).Select(item => new { item.Id, item.UserName, item.Text, item.SubmittedAt, item.ApprovalStatus, item.AdminFeedback })
            .FirstOrDefaultAsync(ct);
        if (report is not null)
        {
            var files = await db.Attachments.AsNoTracking().Where(file => file.ResolutionId == id && file.ResolutionReportId == report.Id)
                .Select(file => new { file.Id, file.OriginalName, file.UploadedAt }).ToListAsync(ct);
            return Results.Ok(new { report.UserName, report.Text, report.SubmittedAt, report.ApprovalStatus, report.AdminFeedback, attachments = files });
        }
        var legacy = await db.Progress.AsNoTracking().Where(item => item.ResolutionId == id && item.NationalId == entry.NationalId &&
            item.UpdatedAt == entry.CreatedAt && item.ReportText != "")
            .Select(item => new { item.ReportText, item.UpdatedAt, item.ApprovalStatus, item.AdminFeedback }).FirstOrDefaultAsync(ct);
        if (legacy is null) return Results.NotFound();
        var legacyFiles = await db.Attachments.AsNoTracking().Where(file => file.ResolutionId == id && file.ResolutionReportId == null && file.UploadedBy == entry.NationalId)
            .Select(file => new { file.Id, file.OriginalName, file.UploadedAt }).ToListAsync(ct);
        return Results.Ok(new { entry.UserName, text = legacy.ReportText, submittedAt = legacy.UpdatedAt, legacy.ApprovalStatus, legacy.AdminFeedback, attachments = legacyFiles });
    }
}
