using Microsoft.Data.Sqlite;
using System.Globalization;
using System.Text;

namespace Vezarati.DbExport;

internal static class Program
{
    private static int Main(string[] args)
    {
        try
        {
            return Run(args);
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine("خطا در ساخت فایل انتقال: " + exception.Message);
            return 1;
        }
    }

    private static int Run(string[] args)
    {
        if (args.Length == 0 || args.Contains("--help") || args.Contains("-h"))
        {
            PrintUsage();
            return args.Length == 0 ? 2 : 0;
        }

        var sourcePath = Path.GetFullPath(args[0]);
        var outputPath = GetOption(args, "--output") ?? GetOption(args, "-o") ?? "ImportVezaratiToSqlServer.sql";
        outputPath = Path.GetFullPath(outputPath);
        if (!File.Exists(sourcePath))
            throw new FileNotFoundException("فایل دیتابیس SQLite پیدا نشد.", sourcePath);
        if (!args.Contains("--replace-target", StringComparer.OrdinalIgnoreCase))
            throw new ArgumentException("برای ساخت اسکریپت کامل باید گزینهٔ --replace-target را اضافه کنید. این اسکریپت داده‌های جدول‌های مقصد را جایگزین می‌کند.");

        var connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = sourcePath,
            Mode = SqliteOpenMode.ReadOnly
        }.ToString();

        using var connection = new SqliteConnection(connectionString);
        connection.Open();
        var tables = ReadTableNames(connection);
        if (tables.Count == 0)
            throw new InvalidOperationException("هیچ جدول برنامه‌ای در دیتابیس SQLite پیدا نشد.");
        var dependencies = tables.ToDictionary(
            table => table,
            table => ReadForeignParents(connection, table),
            StringComparer.OrdinalIgnoreCase);
        var orderedTables = SortByDependencies(tables, dependencies);

        var outputDirectory = Path.GetDirectoryName(outputPath);
        if (!string.IsNullOrWhiteSpace(outputDirectory))
            Directory.CreateDirectory(outputDirectory);

        using var writer = new StreamWriter(outputPath, false, new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
        writer.WriteLine("-- فایل تولیدشده از دیتابیس SQLite برنامهٔ پیگیری مصوبات");
        writer.WriteLine("-- هشدار: داده‌های جدول‌های متناظر dbo در دیتابیس مقصد حذف و جایگزین می‌شوند.");
        writer.WriteLine("-- فقط روی دیتابیس مقصد تازه یا قابل بازنویسی اجرا کنید.");
        writer.WriteLine("USE [vezarati];");
        writer.WriteLine("SET NOCOUNT ON;");
        writer.WriteLine("SET XACT_ABORT ON;");
        writer.WriteLine("BEGIN TRY");
        foreach (var table in orderedTables)
        {
            var objectName = ("dbo." + table).Replace("'", "''");
            var errorText = ($"جدول مقصد dbo.{table} پیدا نشد. API را یک بار به SQL Server وصل و اجرا کنید تا ساختار دیتابیس ساخته شود.").Replace("'", "''");
            writer.WriteLine($"    IF OBJECT_ID(N'{objectName}', N'U') IS NULL THROW 51000, N'{errorText}', 1;");
        }
        writer.WriteLine("    BEGIN TRANSACTION;");

        foreach (var table in orderedTables.AsEnumerable().Reverse())
            writer.WriteLine($"    DELETE FROM [dbo].{QuoteSqlServer(table)};");

        foreach (var table in orderedTables)
        {
            var columns = ReadColumns(connection, table);
            if (columns.Count == 0)
                continue;

            var identity = columns.Count(column => column.PrimaryKeyOrder > 0) == 1
                && columns.Single(column => column.PrimaryKeyOrder > 0).Type.Equals("INTEGER", StringComparison.OrdinalIgnoreCase);
            var columnList = string.Join(", ", columns.Select(column => QuoteSqlServer(column.Name)));
            using var command = connection.CreateCommand();
            command.CommandText = $"SELECT * FROM {QuoteSqlite(table)};";
            using var reader = command.ExecuteReader();

            if (identity)
                writer.WriteLine($"    SET IDENTITY_INSERT [dbo].{QuoteSqlServer(table)} ON;");

            var imported = 0;
            while (reader.Read())
            {
                var values = new string[reader.FieldCount];
                for (var index = 0; index < reader.FieldCount; index++)
                    values[index] = ToSqlLiteral(reader.IsDBNull(index) ? null : reader.GetValue(index));
                writer.WriteLine($"    INSERT INTO [dbo].{QuoteSqlServer(table)} ({columnList}) VALUES ({string.Join(", ", values)});");
                imported++;
            }

            if (identity)
                writer.WriteLine($"    SET IDENTITY_INSERT [dbo].{QuoteSqlServer(table)} OFF;");
            Console.WriteLine($"{table}: {imported} ردیف");
        }

        writer.WriteLine("    COMMIT TRANSACTION;");
        writer.WriteLine("END TRY");
        writer.WriteLine("BEGIN CATCH");
        writer.WriteLine("    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;");
        writer.WriteLine("    THROW;");
        writer.WriteLine("END CATCH;");
        writer.Flush();

        Console.WriteLine("فایل انتقال ساخته شد: " + outputPath);
        return 0;
    }

    private static List<string> ReadTableNames(SqliteConnection connection)
    {
        var tables = new List<string>();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '__EFMigrationsHistory' ORDER BY name;";
        using var reader = command.ExecuteReader();
        while (reader.Read())
            tables.Add(reader.GetString(0));
        return tables;
    }

    private static HashSet<string> ReadForeignParents(SqliteConnection connection, string table)
    {
        var parents = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        using var command = connection.CreateCommand();
        command.CommandText = $"PRAGMA foreign_key_list({QuoteSqlite(table)});";
        using var reader = command.ExecuteReader();
        while (reader.Read())
            parents.Add(reader.GetString(2));
        return parents;
    }

    private static List<string> SortByDependencies(
        IReadOnlyList<string> tables,
        IReadOnlyDictionary<string, HashSet<string>> dependencies)
    {
        var remaining = new HashSet<string>(tables, StringComparer.OrdinalIgnoreCase);
        var ordered = new List<string>();
        while (remaining.Count > 0)
        {
            var ready = remaining
                .Where(table => !dependencies[table].Any(parent =>
                    remaining.Contains(parent) && !parent.Equals(table, StringComparison.OrdinalIgnoreCase)))
                .OrderBy(table => table, StringComparer.OrdinalIgnoreCase)
                .ToList();
            if (ready.Count == 0)
                ready = remaining.OrderBy(table => table, StringComparer.OrdinalIgnoreCase).ToList();

            foreach (var table in ready)
            {
                remaining.Remove(table);
                ordered.Add(table);
            }
        }
        return ordered;
    }

    private static List<ColumnInfo> ReadColumns(SqliteConnection connection, string table)
    {
        var columns = new List<ColumnInfo>();
        using var command = connection.CreateCommand();
        command.CommandText = $"PRAGMA table_info({QuoteSqlite(table)});";
        using var reader = command.ExecuteReader();
        while (reader.Read())
            columns.Add(new ColumnInfo(reader.GetString(1), reader.IsDBNull(2) ? "" : reader.GetString(2), reader.GetInt32(5)));
        return columns;
    }

    private static string ToSqlLiteral(object? value)
    {
        if (value is null || value is DBNull)
            return "NULL";
        if (value is byte[] bytes)
            return "0x" + Convert.ToHexString(bytes);
        if (value is bool boolean)
            return boolean ? "1" : "0";
        if (value is float single)
            return float.IsFinite(single) ? single.ToString("R", CultureInfo.InvariantCulture) : "NULL";
        if (value is double number)
            return double.IsFinite(number) ? number.ToString("R", CultureInfo.InvariantCulture) : "NULL";
        if (value is decimal decimalNumber)
            return decimalNumber.ToString(CultureInfo.InvariantCulture);
        if (value is IFormattable formattable && value is not string)
            return formattable.ToString(null, CultureInfo.InvariantCulture) ?? "NULL";
        return "N'" + Convert.ToString(value, CultureInfo.InvariantCulture)!.Replace("'", "''") + "'";
    }

    private static string QuoteSqlServer(string identifier) => "[" + identifier.Replace("]", "]]") + "]";
    private static string QuoteSqlite(string identifier) => "\"" + identifier.Replace("\"", "\"\"") + "\"";

    private static string? GetOption(string[] args, string name)
    {
        var index = Array.FindIndex(args, value => value.Equals(name, StringComparison.OrdinalIgnoreCase));
        return index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
    }

    private static void PrintUsage()
    {
        Console.WriteLine("ساخت فایل SQL Server از دیتابیس SQLite:");
        Console.WriteLine("dotnet run --project tools\\Vezarati.DbExport -- <sqlite.db> --output <import.sql> --replace-target");
    }

    private sealed record ColumnInfo(string Name, string Type, int PrimaryKeyOrder);
}
