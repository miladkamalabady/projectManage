# سامانه پیگیری مصوبات دفتر وزارتی

این شاخه یک پیاده‌سازی مستقل React و ASP.NET Core 8 برای ثبت و پیگیری مصوبات جلسه‌هاست.

## ساختار

- `src/Vezarati.Web`: کلاینت React/Vite/TypeScript
- `src/Vezarati.Api`: API، EF Core و SQLite

## پیش‌نیازها

- .NET 8 SDK
- Node.js 22.13+ و npm

## اجرا

ترمینال ۱:

```bash
cd src/Vezarati.Api
dotnet restore
dotnet run
```

API در `http://localhost:5080` و دیتابیس در `data/vezarati.db` ساخته می‌شود.

ترمینال ۲:

```bash
cd src/Vezarati.Web
npm install
npm run dev
```

Vite مسیر `/api` را به API روی پورت 5080 proxy می‌کند.

## بیلد

```bash
cd src/Vezarati.Web && npm ci && npm run build
cd ../Vezarati.Api && dotnet publish -c Release -o publish
```

برای استقرار یکپارچه، محتوای `src/Vezarati.Web/dist` را در `src/Vezarati.Api/wwwroot` قرار دهید؛ API فایل‌های استاتیک را سرو می‌کند.

## قابلیت‌ها

- ثبت مصوبه با تاریخ جلسه، شماره، متن، وضعیت اجرا و توضیحات
- گروه‌های پیش‌فرض «شورای معاونان» و «مدیران کل» و مدیریت گروه‌ها
- افزودن/حذف عضو با کد ملی و سمت
- ارجاع به گروه یا افراد، دیواره شخصی برای پیگیری
- گزارش مدیریتی بر اساس وضعیت و عملکرد فردی

## احراز هویت و استعلام کد ملی

برای توسعه محلی از هدرهای `X-User-Id` و `X-User-Name` استفاده شده است. این هدرها احراز هویت امن نیستند و باید پیش از استقرار به ورود سازمانی متصل شوند. سرویس استعلام از طریق `NationalIdLookup` قابل جایگزینی است؛ پیاده‌سازی پیش‌فرض فقط فهرست محلی نمونه را جستجو می‌کند.

