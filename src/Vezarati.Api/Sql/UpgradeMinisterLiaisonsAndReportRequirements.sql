/* Run in the application database using a deployment account with ALTER on
   dbo.Users and dbo.Resolutions. No data is deleted and existing flags default
   to false. Safe to run again. The application's runtime account does not need
   ALTER once this script has been applied. */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
    THROW 51001, 'dbo.Users is not visible. Check the selected database, schema and permissions.', 1;
IF OBJECT_ID(N'dbo.Resolutions', N'U') IS NULL
    THROW 51002, 'dbo.Resolutions is not visible. Check the selected database, schema and permissions.', 1;

IF COL_LENGTH(N'dbo.Users', N'MinisterLiaisonProvince') IS NULL
    EXEC(N'ALTER TABLE dbo.Users ADD MinisterLiaisonProvince nvarchar(80) NOT NULL CONSTRAINT DF_Users_MinisterLiaisonProvince DEFAULT N'''';');
IF COL_LENGTH(N'dbo.Resolutions', N'RequiresReportAttachment') IS NULL
    EXEC(N'ALTER TABLE dbo.Resolutions ADD RequiresReportAttachment bit NOT NULL CONSTRAINT DF_Resolutions_RequiresReportAttachment DEFAULT 0;');
IF COL_LENGTH(N'dbo.Resolutions', N'IsForInformation') IS NULL
    EXEC(N'ALTER TABLE dbo.Resolutions ADD IsForInformation bit NOT NULL CONSTRAINT DF_Resolutions_IsForInformation DEFAULT 0;');

COMMIT TRANSACTION;
SELECT DB_NAME() AS DatabaseName,
    COL_LENGTH(N'dbo.Users', N'MinisterLiaisonProvince') AS MinisterLiaisonProvinceBytes,
    COL_LENGTH(N'dbo.Resolutions', N'RequiresReportAttachment') AS RequiresReportAttachmentBytes,
    COL_LENGTH(N'dbo.Resolutions', N'IsForInformation') AS IsForInformationBytes;
