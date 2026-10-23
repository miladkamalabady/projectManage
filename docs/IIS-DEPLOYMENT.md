# استقرار یکپارچه روی IIS

این روش یک سایت واحد می‌سازد: IIS روی پورت ۴۰۰۰ فرانت React را از `wwwroot` و API را از همان ASP.NET Core اجرا می‌کند. آدرس‌های API به شکل `/api/...` باقی می‌مانند و اجرای دستی `dotnet Vezarati.Api.dll` لازم نیست.

## ۱. آماده‌سازی سرور

- IIS را نصب کنید.
- .NET 8 Hosting Bundle متناسب با معماری سرور را نصب کنید تا ASP.NET Core Module در IIS نصب شود.
- پس از نصب Hosting Bundle، IIS را یک بار راه‌اندازی مجدد کنید.
- برای دیتابیس SQL Server، دسترسی هویت Application Pool را به دیتابیس بدهید.

## ۲. ساخت پوشه انتشار

روی سیستم دارای سورس پروژه، PowerShell را در ریشه مخزن باز کنید و اجرا کنید:

```powershell
.\deploy\Publish-IIS.ps1
```

اسکریپت فرانت را می‌سازد، API را با `dotnet publish` منتشر می‌کند و فایل‌های React را در `www\wwwroot` قرار می‌دهد. خروجی کامل IIS در پوشه `www` ساخته می‌شود. اگر IIS همین پوشه را در حال اجرا دارد، ابتدا سایت یا Application Pool را متوقف کنید تا فایل‌های خروجی قابل جایگزینی باشند.

## ۳. تنظیم IIS

1. در IIS یک Application Pool بسازید، مثلاً `VezaratiPool`.
2. مقدار **.NET CLR Version** را روی **No Managed Code** قرار دهید.
3. برای اجرای ۶۴ بیتی، **Enable 32-Bit Applications** را خاموش بگذارید.
4. یک IIS Website بسازید یا سایت فعلی پورت ۴۰۰۰ را ویرایش کنید:
   - **Physical path:** مسیر پوشه `www` خروجی انتشار
   - **Binding:** پورت `4000`
   - **Application Pool:** `VezaratiPool`
5. محتوای خروجی را روی سرور کپی کنید و سایت را شروع کنید.

فایل `web.config` داخل پروژه همراه انتشار کپی می‌شود؛ این فایل ASP.NET Core Module را راه‌اندازی می‌کند و محدودیت آپلود IIS را با سقف ۵۰ مگابایت هماهنگ می‌کند. آن را از پوشه انتشار حذف نکنید. IIS با ASP.NET Core Module برنامه را بالا می‌آورد و بعد از توقف یا راه‌اندازی مجدد Application Pool نیز آن را دوباره اجرا می‌کند.

## ۴. اتصال SQL Server و دسترسی پوشه‌ها

تنظیمات فعلی اتصال در `appsettings.json` از Windows Integrated Security استفاده می‌کند. اگر IIS و SQL Server روی یک سرور هستند و Application Pool با هویت مجازی اجرا می‌شود، در SQL Server برای هویت زیر Login بسازید و روی دیتابیس برنامه دسترسی لازم را بدهید:

```text
IIS APPPOOL\VezaratiPool
```

اگر SQL Server روی سرور دیگری است، از هویت دامنه‌ای مناسب یا SQL Authentication استفاده کنید. تنظیمات استقرار را در فایل تنظیمات سرور مثل `www\appsettings.Production.json` قرار دهید و مقادیر محرمانه را به مخزن Git اضافه نکنید.

برای ذخیره پیوست‌ها، هویت Application Pool باید روی پوشه `www\data` دسترسی **Modify** داشته باشد. اگر پوشه هنوز ایجاد نشده، آن را بسازید و سپس دسترسی را تنظیم کنید.

نمونه دستور ACL در PowerShell مدیر سرور:

```powershell
New-Item -ItemType Directory -Path "C:\path\to\www\data" -Force
icacls "C:\path\to\www\data" /grant "IIS APPPOOL\VezaratiPool:(OI)(CI)M"
```

اگر از اسکریپت مهاجرت SQL Server موجود در `src\Vezarati.Api\Sql` استفاده می‌کنید، آن را پیش از اجرای نسخه جدید روی دیتابیس اعمال کنید.

## ۵. بررسی اجرا

پس از شروع سایت:

- صفحه اصلی: `http://localhost:4000/`
- API احراز هویت: `http://localhost:4000/api/auth/me`

پاسخ `401` از `/api/auth/me` پیش از ورود طبیعی است و نشان می‌دهد مسیر API به ASP.NET Core رسیده است.

اگر IIS خطای `500.30` داد، Event Viewer بخش **Windows Logs → Application** را بررسی کنید. همچنین مطمئن شوید Hosting Bundle نصب شده، `web.config` در پوشه `www` هست، تنظیم اتصال دیتابیس معتبر است و هویت Application Pool مجوز دسترسی به SQL Server و `www\data` دارد.

## نکته

با این استقرار، IIS سایت را از پوشه انتشار `www` میزبانی می‌کند؛ فایل‌های build شده React داخل زیرپوشه `wwwroot` قرار می‌گیرند. پورت ۴۰۰۰ فقط در IIS تنظیم می‌شود و نیازی به اجرای Vite یا باز نگه داشتن ترمینال dotnet روی سرور نیست.
