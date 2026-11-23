using System.Text.RegularExpressions;
static class ResolutionReportTopics
{
    private static readonly (string Key, string[] Terms)[] Topics = [
        ("registration", ["ثبت نام","ثبت‌نام","نام نویسی","نام‌نویسی","پذیرش"]),
        ("educational", ["آموزش","آموزشی","درسی","یادگیری","امتحان","کیفیت آموزشی"]),
        ("educational_upbringing", ["پرورشی","تربیتی","فرهنگی","اردو","تشکل دانش آموزی","تشکل دانش‌آموزی"]),
        ("health", ["سلامت","بهداشت","درمان","تغذیه","پزشکی","ایمنی"]),
        ("prayer", ["نماز","قرآن","مسجد","دینی","اقامه نماز"]),
        ("technology", ["فناوری","هوشمند سازی","هوشمندسازی","دیجیتال","هوش مصنوعی","زیرساخت فناوری"]),
        ("human_resources", ["نیروی انسانی","معلم","فرهنگیان","کارکنان","استخدام","جذب نیرو"]),
        ("infrastructure", ["بودجه","اعتبار","مالی","عمرانی","تجهیز مدارس","ساخت و ساز","ساخت‌وساز"])
    ];
    private static string Normalize(string value) => Regex.Replace(value.Normalize(System.Text.NormalizationForm.FormKC).Replace("ي","ی").Replace("ى","ی").Replace("ك","ک"), @"[\s‌‏‎]", "");
    private static readonly (string Key, string[] Terms)[] NormalizedTopics = Topics.Select(topic => (topic.Key, topic.Terms.Select(Normalize).ToArray())).ToArray();
    public static string Classify(string text)
    {
        var normalized = Normalize(text);
        foreach (var topic in NormalizedTopics)
            if (topic.Terms.Any(term => normalized.Contains(term))) return topic.Key;
        return "other";
    }
}
