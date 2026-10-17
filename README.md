# سامانه پیگیری مصوبات دفتر وزارتی

این شاخه یک پیاده‌سازی مستقل React و ASP.NET Core 8 برای ثبت و پیگیری مصوبات جلسه‌هاست.

## ساختار

- `src/Vezarati.Web`: کلاینت React/Vite/TypeScript
- `src/Vezarati.Api`: API، EF Core و SQLite

## پیش‌نیازها

- .NET 8 SDK
- Node.js 22.13+ و npm

## اجرا در Windows PowerShell

ابتدا از ریشه مخزن به پوشه وب بروید و وابستگی‌ها را نصب کنید. این مراحل فقط بار اول لازم‌اند:

```powershell
Set-Location .\src\Vezarati.Web
npm ci
npm run dev
```

باز کردن ترمینال دوم برای API:

```powershell
Set-Location .\src\Vezarati.Api
dotnet restore
dotnet run
```

API روی `http://localhost:5080` اجرا می‌شود و دیتابیس `data/vezarati.db` را می‌سازد. Vite درخواست‌های `/api` را به API پروکسی می‌کند. برای اجرا از دستور `npm run dev` استفاده کنید؛ اجرای مستقیم `vite` لازم نیست. اگر PowerShell خطای `vite is not recognized` داد، مطمئن شوید در پوشه `src\Vezarati.Web` هستید، `npm ci` با موفقیت تمام شده، و بعد `npm run dev` را اجرا کنید.

## بیلد

از ریشه مخزن:

```powershell
Push-Location .\src\Vezarati.Web
npm ci
npm run build
Pop-Location

Push-Location .\src\Vezarati.Api
dotnet publish -c Release -o publish
Pop-Location
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
