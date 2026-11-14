using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Vezarati.Api.Models;

public sealed class ProvincialPole
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string ResponsibleId { get; set; } = "";
    [System.Text.Json.Serialization.JsonIgnore] public string TripType { get; set; } = "internal";
    [System.Text.Json.Serialization.JsonIgnore] public bool? MinisterPresent { get; set; }
    [System.Text.Json.Serialization.JsonIgnore] public string Representative { get; set; } = "";
    public List<PoleProvince> Provinces { get; set; } = [];
}

public sealed class PoleProvince
{
    public string Province { get; set; } = "";
    public int ProvincialPoleId { get; set; }
}

public sealed class ProvincialTrip
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string Province { get; set; } = "";
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public string TripType { get; set; } = "";
    public bool? MinisterPresent { get; set; }
    public string Representative { get; set; } = "";
}

static class ProvincialTrips
{
    private static readonly string[] Provinces = ["آذربایجان شرقی","آذربایجان غربی","اردبیل","اصفهان","البرز","ایلام","بوشهر","تهران","چهارمحال و بختیاری","خراسان جنوبی","خراسان رضوی","خراسان شمالی","خوزستان","زنجان","سمنان","سیستان و بلوچستان","فارس","قزوین","قم","کردستان","کرمان","کرمانشاه","کهگیلویه و بویراحمد","گلستان","گیلان","لرستان","مازندران","مرکزی","هرمزگان","همدان","یزد"];

    public static async Task<ProvincialPole?> FindPole(AppDb db, string province) =>
        await db.ProvincialPoles.AsNoTracking().SingleOrDefaultAsync(pole => pole.Provinces.Any(item => item.Province == province));

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/provincial-poles", async (AppDb db) =>
            await db.ProvincialPoles.AsNoTracking().Include(pole => pole.Provinces).OrderBy(pole => pole.Name).ToListAsync());

        app.MapMethods("/api/provincial-poles/{id:int}", ["PUT"], async (int id, PoleInput input, AppDb db) =>
        {
            var name = input.Name?.Trim() ?? "";
            var provinces = (input.Provinces ?? []).Distinct().ToArray();
            if (name.Length is 0 or > 200 || provinces.Length == 0 || provinces.Any(province => !Provinces.Contains(province)))
                return Results.BadRequest(new { error = "نام قطب و حداقل یک استان معتبر را وارد کنید." });
            if (!await db.Users.AnyAsync(user => user.NationalId == input.ResponsibleId))
                return Results.BadRequest(new { error = "مسئول قطب را از کاربران سامانه انتخاب کنید." });
            var pole = await db.ProvincialPoles.Include(item => item.Provinces).FirstOrDefaultAsync(item => item.Id == id);
            if (pole is null && id != 0) return Results.NotFound();
            if (await db.PoleProvinces.AnyAsync(item => item.ProvincialPoleId != id && provinces.Contains(item.Province)))
                return Results.Conflict(new { error = "یک یا چند استان قبلاً به قطب دیگری اختصاص یافته‌اند." });
            if (pole is null)
            {
                pole = new ProvincialPole();
                db.ProvincialPoles.Add(pole);
            }
            pole.Name = name;
            pole.ResponsibleId = input.ResponsibleId!;
            foreach (var province in pole.Provinces.Where(item => !provinces.Contains(item.Province)).ToList())
            {
                db.PoleProvinces.Remove(province);
                pole.Provinces.Remove(province);
            }
            foreach (var province in provinces.Where(name => !pole.Provinces.Any(item => item.Province == name)))
                pole.Provinces.Add(new PoleProvince { Province = province });
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException)
            {
                return Results.Conflict(new { error = "ذخیرهٔ قطب انجام نشد. فهرست قطب‌ها را تازه کنید و دوباره تلاش کنید." });
            }
            return Results.Ok(pole);
        });

        app.MapGet("/api/provincial-trips", async (HttpContext context, AppDb db) =>
        {
            var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
            var query = db.ProvincialTrips.AsNoTracking();
            if (!context.User.IsInRole("ادمین"))
                query = query.Where(trip => db.Resolutions.Any(item => item.ProvincialTripId == trip.Id && !item.IsArchived &&
                    (item.PublishToAll || item.Assignments.Any(assignment => assignment.NationalId == userId) ||
                    db.GroupMembers.Any(member => member.NationalId == userId && (item.GroupId == member.GroupId ||
                        item.GroupAssignments.Any(assignment => assignment.GroupId == member.GroupId))))));
            return await query.OrderByDescending(trip => trip.StartDate).ThenByDescending(trip => trip.Id).ToListAsync();
        });

        app.MapMethods("/api/provincial-trips/{id:int}", ["PUT"], async (int id, TripInput input, AppDb db) =>
        {
            var title = input.Title?.Trim() ?? "";
            if (title.Length is 0 or > 300 || !Provinces.Contains(input.Province) || input.StartDate == default || input.EndDate < input.StartDate)
                return Results.BadRequest(new { error = "عنوان، استان و تاریخ شروع و پایان معتبر را وارد کنید." });
            if (!ValidAttendance(input.TripType, input.MinisterPresent, input.Representative))
                return Results.BadRequest(new { error = "نوع سفر، وضعیت حضور وزیر و در صورت غیبت نام نماینده را وارد کنید." });
            if (await FindPole(db, input.Province!) is null)
                return Results.BadRequest(new { error = "ابتدا برای این استان در بخش کاربران یک قطب و مسئول تعیین کنید." });
            var trip = await db.ProvincialTrips.FindAsync(id);
            if (trip is null && id != 0) return Results.NotFound();
            if (trip is not null && (trip.Province != input.Province || trip.StartDate != input.StartDate || trip.EndDate != input.EndDate) &&
                await db.Resolutions.AnyAsync(item => item.ProvincialTripId == id))
                return Results.Conflict(new { error = "استان و تاریخ سفر پس از ثبت مصوبه یا پیش‌نویس قابل تغییر نیست." });
            if (trip is null)
            {
                trip = new ProvincialTrip();
                db.ProvincialTrips.Add(trip);
            }
            trip.Title = title;
            trip.Province = input.Province!;
            trip.StartDate = input.StartDate;
            trip.EndDate = input.EndDate;
            trip.TripType = input.TripType!;
            trip.MinisterPresent = input.TripType == "external" ? input.MinisterPresent : null;
            trip.Representative = trip.MinisterPresent == false ? input.Representative!.Trim() : "";
            await db.SaveChangesAsync();
            return Results.Ok(trip);
        });
    }

    public static DateOnly CurrentDate => DateOnly.FromDateTime(DateTime.UtcNow.AddHours(3.5));

    public static string DraftStatus(DateOnly? endDate, DateOnly today) => endDate < today ? "closed" : "draft";

    public static IResult DraftActionUnavailable() =>
        Results.Conflict(new { error = "پیش‌نویس کمیته سفر گزارش اقدام، بررسی یا تغییر وضعیت ندارد." });

    public static async Task<(ResolutionCreate Request, string PoleName, string? Error)> PrepareResolution(
        AppDb db, ResolutionCreate request, Resolution? existing)
    {
        var isProvincial = request.IsSpecialTracking && request.SpecialTrackingType == "provincial";
        if (existing is not null && (existing.IsSpecialTracking != request.IsSpecialTracking ||
            (request.IsSpecialTracking && existing.SpecialTrackingType != ResolutionTracking.NormalizeType(request.SpecialTrackingType)) ||
            existing.ProvincialTripId != request.ProvincialTripId || existing.IsCommitteeDraft != request.IsCommitteeDraft))
            return (request, "", "نوع و سفر مرتبط با مورد ثبت‌شده قابل تغییر نیست.");
        if (request.ProvincialTripId is null)
        {
            if (request.IsCommitteeDraft || (isProvincial && existing is null))
                return (request, "", "ابتدا سفر استانی مرتبط را ثبت و انتخاب کنید.");
            return (request, existing?.ProvincialPoleName ?? "", null);
        }
        if (!isProvincial) return (request, "", "فقط موارد سفر استانی می‌توانند به سفر مرتبط شوند.");
        var trip = await db.ProvincialTrips.AsNoTracking().FirstOrDefaultAsync(item => item.Id == request.ProvincialTripId);
        if (trip is null) return (request, "", "سفر مرتبط پیدا نشد.");
        if (request.IsCommitteeDraft && trip.EndDate < CurrentDate)
            return (request, "", "مهلت ثبت یا ویرایش پیش‌نویس این سفر پایان یافته است.");
        var pole = await FindPole(db, trip.Province);
        if (pole is null || !await db.Users.AnyAsync(user => user.NationalId == pole.ResponsibleId))
            return (request, "", "برای استان این سفر در بخش کاربران یک قطب و مسئول معتبر تعیین کنید.");

        return (request with
        {
            Province = trip.Province, MeetingDate = trip.StartDate, MeetingDateJalali = null,
            People = [.. (request.People ?? []).Append(pole.ResponsibleId).Distinct()],
            StartDate = request.IsCommitteeDraft ? trip.StartDate : request.StartDate,
            StartDateJalali = request.IsCommitteeDraft ? null : request.StartDateJalali,
            DueDate = request.IsCommitteeDraft ? trip.EndDate : request.DueDate,
            DueDateJalali = request.IsCommitteeDraft ? null : request.DueDateJalali,
            RequiresPeriodicReport = !request.IsCommitteeDraft && request.RequiresPeriodicReport,
            PublishToAll = !request.IsCommitteeDraft && request.PublishToAll,
        }, pole.Name, null);
    }

    private static bool ValidAttendance(string? type, bool? present, string? representative) =>
        type == "internal" || (type == "external" && (present == true || (present == false && representative?.Trim().Length is > 0 and <= 300)));

    private sealed record PoleInput(string? Name, string? ResponsibleId, string[]? Provinces);
    private sealed record TripInput(string? Title, string? Province, DateOnly StartDate, DateOnly EndDate, string? TripType, bool? MinisterPresent, string? Representative);
}
