/*
  Vezarati user/group normalization upgrade
  Run once against the existing SQL Server database before deploying the new API.
  Back up the database first. This script migrates dbo.Directory and any denormalized
  names from dbo.GroupMembers into dbo.Users, then removes the obsolete columns/table.
*/
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
    THROW 51000, N'جدول dbo.Users پیدا نشد.', 1;
IF OBJECT_ID(N'dbo.GroupMembers', N'U') IS NULL
    THROW 51001, N'جدول dbo.GroupMembers پیدا نشد.', 1;

IF COL_LENGTH(N'dbo.Users', N'Title') IS NULL
    ALTER TABLE dbo.Users ADD Title nvarchar(max) NOT NULL CONSTRAINT DF_Users_Title_Normalization DEFAULT N'';
IF COL_LENGTH(N'dbo.Users', N'OrganizationUnit') IS NULL
    ALTER TABLE dbo.Users ADD OrganizationUnit nvarchar(max) NOT NULL CONSTRAINT DF_Users_OrganizationUnit_Normalization DEFAULT N'';

CREATE TABLE #People
(
    NationalId nvarchar(450) NOT NULL PRIMARY KEY,
    DisplayName nvarchar(max) NOT NULL,
    Title nvarchar(max) NOT NULL
);

IF OBJECT_ID(N'dbo.Directory', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.Directory', N'Title') IS NULL
        ALTER TABLE dbo.Directory ADD Title nvarchar(max) NOT NULL CONSTRAINT DF_Directory_Title_Normalization DEFAULT N'';

    INSERT INTO #People (NationalId, DisplayName, Title)
    SELECT LTRIM(RTRIM(d.NationalId)), COALESCE(d.DisplayName, N''), COALESCE(d.Title, N'')
    FROM dbo.Directory d
    WHERE NULLIF(LTRIM(RTRIM(d.NationalId)), N'') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM #People p WHERE p.NationalId = LTRIM(RTRIM(d.NationalId)));
END;

IF COL_LENGTH(N'dbo.GroupMembers', N'DisplayName') IS NOT NULL
BEGIN
    DECLARE @groupTitleExpr nvarchar(200) =
        CASE WHEN COL_LENGTH(N'dbo.GroupMembers', N'Title') IS NOT NULL
             THEN N'COALESCE(gm.Title, N'''')' ELSE N'N'''' ' END;
    DECLARE @groupPeopleSql nvarchar(max) =
        N'INSERT INTO #People (NationalId, DisplayName, Title)
          SELECT LTRIM(RTRIM(gm.NationalId)), COALESCE(gm.DisplayName, N''''), ' + @groupTitleExpr + N'
          FROM dbo.GroupMembers gm
          WHERE NULLIF(LTRIM(RTRIM(gm.NationalId)), N'''') IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM #People p WHERE p.NationalId = LTRIM(RTRIM(gm.NationalId)));';
    EXEC sys.sp_executesql @groupPeopleSql;
END
ELSE
BEGIN
    INSERT INTO #People (NationalId, DisplayName, Title)
    SELECT LTRIM(RTRIM(gm.NationalId)), LTRIM(RTRIM(gm.NationalId)), N''
    FROM dbo.GroupMembers gm
    WHERE NULLIF(LTRIM(RTRIM(gm.NationalId)), N'') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM #People p WHERE p.NationalId = LTRIM(RTRIM(gm.NationalId)));
END;

IF EXISTS
(
    SELECT NationalId FROM dbo.Users
    GROUP BY NationalId HAVING COUNT(*) > 1
)
    THROW 51002, N'در dbo.Users کدملی تکراری وجود دارد؛ ابتدا تکراری‌ها را اصلاح کنید.', 1;
IF EXISTS (SELECT 1 FROM dbo.Users WHERE NationalId IS NULL OR LEN(NationalId) > 11)
    THROW 51003, N'کد ملی کاربران باید حداکثر ۱۱ رقم باشد.', 1;
IF EXISTS (SELECT 1 FROM dbo.GroupMembers WHERE NationalId IS NULL OR LEN(NationalId) > 11)
    THROW 51004, N'کد ملی اعضای گروه باید حداکثر ۱۱ رقم باشد.', 1;

IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.Users') AND name=N'IX_Users_NationalId')
    DROP INDEX IX_Users_NationalId ON dbo.Users;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.GroupMembers') AND name=N'IX_GroupMembers_GroupId_NationalId')
    DROP INDEX IX_GroupMembers_GroupId_NationalId ON dbo.GroupMembers;
ALTER TABLE dbo.Users ALTER COLUMN NationalId nvarchar(11) NOT NULL;
ALTER TABLE dbo.GroupMembers ALTER COLUMN NationalId nvarchar(11) NOT NULL;

INSERT INTO dbo.Users
(
    NationalId, DisplayName, Role, Title, OrganizationUnit,
    FirstName, LastName, Father, Gender, BirthDate, PersianBirthDate, Mobile,
    MobileOverriddenByAdmin, UserType, PersonnelCode, OrgPositionCode, OrgPositionDesc,
    OrgPositionTypeCode, OrgPositionTypeDesc, RegionId, LastLoginAt
)
SELECT
    p.NationalId, p.DisplayName, N'کاربر', p.Title, N'',
    N'', N'', N'', NULL, N'', N'', N'', 0, NULL, N'', N'', N'', NULL, N'', NULL, NULL
FROM #People p
WHERE NOT EXISTS (SELECT 1 FROM dbo.Users u WHERE u.NationalId = p.NationalId);

UPDATE u
SET
    DisplayName = CASE WHEN NULLIF(LTRIM(RTRIM(u.DisplayName)), N'') IS NULL THEN p.DisplayName ELSE u.DisplayName END,
    Title = CASE WHEN NULLIF(LTRIM(RTRIM(u.Title)), N'') IS NULL THEN p.Title ELSE u.Title END
FROM dbo.Users u
JOIN #People p ON p.NationalId = u.NationalId;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Users') AND name = N'IX_Users_NationalId')
    CREATE UNIQUE INDEX IX_Users_NationalId ON dbo.Users (NationalId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.GroupMembers') AND name = N'IX_GroupMembers_GroupId_NationalId')
    CREATE UNIQUE INDEX IX_GroupMembers_GroupId_NationalId ON dbo.GroupMembers (GroupId, NationalId);

-- Remove an old membership-to-user FK if present, then add the normalized relation.
DECLARE @dropFkSql nvarchar(max) = N'';
SELECT @dropFkSql = @dropFkSql + N'ALTER TABLE dbo.GroupMembers DROP CONSTRAINT ' + QUOTENAME(fk.name) + N';'
FROM sys.foreign_keys fk
WHERE fk.parent_object_id = OBJECT_ID(N'dbo.GroupMembers')
  AND fk.referenced_object_id = OBJECT_ID(N'dbo.Users');
IF @dropFkSql <> N'' EXEC sys.sp_executesql @dropFkSql;

IF COL_LENGTH(N'dbo.GroupMembers', N'DisplayName') IS NOT NULL
    ALTER TABLE dbo.GroupMembers DROP COLUMN DisplayName;
IF COL_LENGTH(N'dbo.GroupMembers', N'Title') IS NOT NULL
    ALTER TABLE dbo.GroupMembers DROP COLUMN Title;

IF NOT EXISTS
(
    SELECT 1 FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID(N'dbo.GroupMembers')
      AND name = N'FK_GroupMembers_Users_NationalId'
)
    ALTER TABLE dbo.GroupMembers WITH CHECK
        ADD CONSTRAINT FK_GroupMembers_Users_NationalId
        FOREIGN KEY (NationalId) REFERENCES dbo.Users (NationalId) ON DELETE CASCADE;

IF OBJECT_ID(N'dbo.Directory', N'U') IS NOT NULL
    DROP TABLE dbo.Directory;

DROP TABLE #People;
COMMIT TRANSACTION;
