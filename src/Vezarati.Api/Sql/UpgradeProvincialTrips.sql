-- Run once as a database administrator on the SQL Server instance used by the application.
USE [vezarati];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'vezarati' OR OBJECT_ID(N'dbo.Resolutions', N'U') IS NULL
    THROW 50001, N'The existing vezarati database and dbo.Resolutions table are required.', 1;

BEGIN TRY
    BEGIN TRANSACTION;
    IF OBJECT_ID(N'dbo.ProvincialPoles', N'U') IS NULL
        CREATE TABLE dbo.ProvincialPoles (Id int IDENTITY(1,1) PRIMARY KEY, Name nvarchar(200) NOT NULL, ResponsibleId nvarchar(11) NOT NULL, TripType nvarchar(16) NOT NULL, MinisterPresent bit NULL, Representative nvarchar(300) NOT NULL);
    IF OBJECT_ID(N'dbo.PoleProvinces', N'U') IS NULL
        CREATE TABLE dbo.PoleProvinces (Province nvarchar(80) PRIMARY KEY, ProvincialPoleId int NOT NULL REFERENCES dbo.ProvincialPoles(Id) ON DELETE CASCADE);
    IF OBJECT_ID(N'dbo.ProvincialTrips', N'U') IS NULL
        CREATE TABLE dbo.ProvincialTrips (Id int IDENTITY(1,1) PRIMARY KEY, Title nvarchar(300) NOT NULL, Province nvarchar(80) NOT NULL, StartDate date NOT NULL, EndDate date NOT NULL, TripType nvarchar(16) NOT NULL, MinisterPresent bit NULL, Representative nvarchar(300) NOT NULL);
    IF COL_LENGTH(N'dbo.Resolutions', N'ProvincialTripId') IS NULL
        ALTER TABLE dbo.Resolutions ADD ProvincialTripId int NULL CONSTRAINT FK_Resolutions_ProvincialTrips_ProvincialTripId REFERENCES dbo.ProvincialTrips(Id);
    IF COL_LENGTH(N'dbo.Resolutions', N'IsCommitteeDraft') IS NULL
        ALTER TABLE dbo.Resolutions ADD IsCommitteeDraft bit NOT NULL CONSTRAINT DF_Resolutions_IsCommitteeDraft DEFAULT 0;
    IF COL_LENGTH(N'dbo.Resolutions', N'ProvincialPoleName') IS NULL
        ALTER TABLE dbo.Resolutions ADD ProvincialPoleName nvarchar(200) NOT NULL CONSTRAINT DF_Resolutions_ProvincialPoleName DEFAULT N'';
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Resolutions') AND name = N'IX_Resolutions_ProvincialTripId')
        EXEC(N'CREATE INDEX IX_Resolutions_ProvincialTripId ON dbo.Resolutions(ProvincialTripId)');

    COMMIT TRANSACTION;
    PRINT N'Provincial trips schema is ready.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
