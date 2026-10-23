#!/usr/bin/env python3
"""Export rows from the application's SQLite database as a SQL Server import script.

The destination database schema must already have been created by the application
using the SQL Server provider. The generated script replaces rows in matching
application tables and preserves integer primary keys.
"""
from __future__ import annotations

import argparse
import math
import sqlite3
from pathlib import Path
from typing import Any


def bracket(name: str) -> str:
    return "[" + name.replace("]", "]]") + "]"


def literal(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bytes):
        return "0x" + value.hex()
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            return "NULL"
        return format(value, ".17g")
    return "N'" + str(value).replace("'", "''") + "'"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sqlite_db", help="Path to the existing SQLite database file")
    parser.add_argument("-o", "--output", default="ImportVezaratiToSqlServer.sql",
                        help="Output SQL script path (default: %(default)s)")
    parser.add_argument("--replace-target", action="store_true",
                        help="Allow generated SQL to delete existing rows in destination application tables")
    args = parser.parse_args()

    source = Path(args.sqlite_db).expanduser().resolve()
    if not source.is_file():
        parser.error(f"SQLite database not found: {source}")
    if not args.replace_target:
        parser.error("For a full migration, rerun with --replace-target. The generated script clears destination application tables first.")

    connection = sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        table_names = [
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '__EFMigrationsHistory' ORDER BY name"
            )
        ]
        if not table_names:
            parser.error("No application tables were found in the SQLite database.")

        statements: list[str] = [
            "-- Generated from: " + source.name,
            "-- WARNING: this script deletes rows from matching dbo tables before importing.",
            "USE [vezarati];",
            "-- Run against the empty/new SQL Server database after the API has created its schema.",
            "SET NOCOUNT ON;",
            "SET XACT_ABORT ON;",
            "BEGIN TRY",
            "    BEGIN TRANSACTION;",
        ]

        for table in table_names:
            statements.append(f"    ALTER TABLE [dbo].{bracket(table)} NOCHECK CONSTRAINT ALL;")
        for table in table_names:
            statements.append(f"    DELETE FROM [dbo].{bracket(table)};")

        for table in table_names:
            info = list(connection.execute(f"PRAGMA table_info({bracket(table)})"))
            columns = [row["name"] for row in info]
            if not columns:
                continue
            primary_key = [row for row in info if row["pk"]]
            identity = len(primary_key) == 1 and primary_key[0]["type"].strip().upper() == "INTEGER"
            column_sql = ", ".join(bracket(column) for column in columns)
            rows = connection.execute(f"SELECT * FROM {bracket(table)}")
            if identity:
                statements.append(f"    SET IDENTITY_INSERT [dbo].{bracket(table)} ON;")
            for row in rows:
                values = ", ".join(literal(row[column]) for column in columns)
                statements.append(f"    INSERT INTO [dbo].{bracket(table)} ({column_sql}) VALUES ({values});")
            if identity:
                statements.append(f"    SET IDENTITY_INSERT [dbo].{bracket(table)} OFF;")

        for table in table_names:
            statements.append(f"    ALTER TABLE [dbo].{bracket(table)} WITH CHECK CHECK CONSTRAINT ALL;")
        statements.extend([
            "    COMMIT TRANSACTION;",
            "END TRY",
            "BEGIN CATCH",
            "    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;",
            "    THROW;",
            "END CATCH;",
            "",
        ])
    finally:
        connection.close()

    output = Path(args.output).expanduser().resolve()
    output.write_text("\n".join(statements), encoding="utf-8-sig")
    print(f"Created {output} with {len(table_names)} tables.")
    print("Review the WARNING at the top; the import replaces destination rows in those tables.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
