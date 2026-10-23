# انتقال دیتابیس پیگیری مصوبات به SQL Server

## پیش‌نیازها

- .NET 8 SDK و SQL Server روی سیستم نصب باشند.
- نمونهٔ `MSSQLSERVER2022` از همان سیستم قابل دسترسی باشد.
- فایل دیتابیس SQLite قبلی را نگه دارید؛ معمولاً در `src/Vezarati.Api/data/vezarati.db` است.
- پیش از کپی فایل SQLite، API قدیمی را متوقف کنید.
- اگر پیوست دارید، پوشهٔ `src/Vezarati.Api/data/uploads` را هم جداگانه نگه دارید؛ محتوای فایل‌های پیوست در SQLite ذخیره نشده است.

## ساخت دیتابیس و جدول‌های SQL Server

رشتهٔ اتصال در `src/Vezarati.Api/appsettings.json` با کلید `DefaultConnection` تنظیم شده است. API را یک‌بار اجرا کنید تا دیتابیس و جدول‌ها ساخته شوند:

```powershell
dotnet run --project src\Vezarati.Api
```

بعد از شروع موفق API، آن را متوقف کنید. دیتابیس مقصد باید `vezarati` باشد و جدول‌های برنامه را داشته باشد.

## ساخت فایل انتقال داده

از ریشهٔ مخزن در PowerShell اجرا کنید:

```powershell
dotnet run --project tools\Vezarati.DbExport -- "C:\path\to\vezarati.db" --output "C:\path\to\ImportVezaratiToSqlServer.sql" --replace-target
```

اولین اجرا ممکن است بستهٔ `Microsoft.Data.Sqlite` را از NuGet بازیابی کند. فایل SQL تولیدشده را در SSMS باز کنید و روی نمونهٔ SQL Server دارای دیتابیس `vezarati` اجرا کنید. اسکریپت شناسه‌ها را حفظ می‌کند و جدول‌ها را با داده‌های SQLite جایگزین می‌کند.

> گزینهٔ `--replace-target` برای جلوگیری از اجرای تصادفی لازم است. خود اسکریپت ردیف‌های موجود جدول‌های متناظر در مقصد را پاک می‌کند؛ فقط روی دیتابیس مقصد تازه یا قابل بازنویسی اجرا کنید.

پس از انتقال، فایل‌های پوشهٔ قدیمی `data\uploads` را به همان مسیر نسبی کنار API جدید کپی کنید. پیوست‌ها با انتقال ردیف‌های دیتابیس منتقل نمی‌شوند.
