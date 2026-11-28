using System.Security.Cryptography;
using Microsoft.AspNetCore.StaticFiles;
using Vezarati.Api.Models;

static class ReportAttachments
{
    public static string? Validate(bool required, IReadOnlyList<IFormFile> files)
    {
        if (required && files.Count == 0) return "برای این مصوبه ارسال حداقل یک فایل پیوست همراه گزارش الزامی است.";
        if (files.Count > 10) return "حداکثر ۱۰ فایل را همراه گزارش ارسال کنید.";
        foreach (var file in files)
        {
            if (file.Length == 0) return "فایل پیوست نباید خالی باشد.";
            if (file.Length > 50 * 1024 * 1024) return "حداکثر حجم هر فایل ۵۰ مگابایت است.";
            if (!AttachmentFileTypes.Allowed.Contains(Path.GetExtension(file.FileName).ToLowerInvariant())) return "نوع فایل پیوست مجاز نیست.";
        }
        return null;
    }
    public static async Task Save(AppDb db, string root, ResolutionReport report, List<IFormFile> files, List<string> paths, CancellationToken ct)
    {
        var directory = Path.Combine(root, "data", "uploads");
        Directory.CreateDirectory(directory);
        var provider = new FileExtensionContentTypeProvider();
        foreach (var file in files)
        {
            var name = Guid.NewGuid().ToString("N") + Path.GetExtension(file.FileName).ToLowerInvariant();
            var path = Path.Combine(directory, name);
            paths.Add(path);
            await using (var output = File.Create(path)) await file.CopyToAsync(output, ct);
            await using var input = File.OpenRead(path);
            var hash = Convert.ToHexString(await SHA256.HashDataAsync(input, ct));
            provider.TryGetContentType(file.FileName, out var contentType);
            db.Attachments.Add(new ResolutionAttachment { ResolutionId = report.ResolutionId, ResolutionReportId = report.Id,
                OriginalName = Path.GetFileName(file.FileName.Replace('\\', '/')), StoredName = name, ContentType = contentType ?? "application/octet-stream",
                ContentHash = hash, Size = file.Length, UploadedBy = report.NationalId, UploaderName = report.UserName, UploadedAt = report.SubmittedAt });
        }
    }
}
