-- ============================================================================
--  database/formularios_schema.sql
--  Tabla para solicitudes de Permisos y Vacaciones enviadas desde formularios
--  externos (acceso público, sin requerir login).
--
--  Ejecutar una sola vez o dejar que el bootstrap del controller lo haga.
-- ============================================================================

-- ─── TABLA PRINCIPAL ────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.FORM_SOLICITUDES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.FORM_SOLICITUDES (
    ID_SOLICITUD    INT IDENTITY(1,1)   NOT NULL,

    -- Tipo: 'PERMISO' | 'VACACION'
    TIP_SOLICITUD   NVARCHAR(20)        NOT NULL,

    -- Datos del empleado
    NOM_SOLICIT     NVARCHAR(150)       NOT NULL,
    NRO_IDENT       NVARCHAR(30)        NOT NULL,
    CARGO           NVARCHAR(100)       NULL,
    AREA            NVARCHAR(100)       NULL,
    CORREO_EMPL     NVARCHAR(150)       NULL,

    -- Período solicitado
    FEC_INI         DATE                NOT NULL,
    FEC_FIN         DATE                NULL,
    HORA_INI        NVARCHAR(5)         NULL,   -- formato HH:MM (solo permisos)
    HORA_FIN        NVARCHAR(5)         NULL,   -- formato HH:MM (solo permisos)
    DIAS_SOLIC      INT                 NULL,
    HORAS_SOLIC     DECIMAL(5,2)        NULL,

    -- Detalle del permiso
    TIP_PERMISO     NVARCHAR(50)        NULL,   -- Personal, Médico, Calamidad, etc.
    ANO_VACACION    SMALLINT            NULL,   -- Año al que corresponden las vacaciones

    -- Motivo y observaciones
    MOTIVO          NVARCHAR(500)       NULL,
    JEFE_INMED      NVARCHAR(150)       NULL,

    -- Trazabilidad
    ESTADO          NVARCHAR(20)        NOT NULL CONSTRAINT DF_FORM_ESTADO   DEFAULT (N'PENDIENTE'),
    FEC_REGI        DATETIME2           NOT NULL CONSTRAINT DF_FORM_FEC_REGI DEFAULT (SYSDATETIME()),
    IP_ORIGEN       NVARCHAR(50)        NULL,

    CONSTRAINT PK_FORM_SOLICITUDES PRIMARY KEY CLUSTERED (ID_SOLICITUD)
  );

  PRINT '[+] Tabla FORM_SOLICITUDES creada.';
END
ELSE
  PRINT '[=] Tabla FORM_SOLICITUDES ya existe.';
GO

-- ─── ÍNDICES ÚTILES PARA CONSULTAS ──────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.FORM_SOLICITUDES')
    AND name = 'IX_FORM_SOLIC_TIPO_FECHA'
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_FORM_SOLIC_TIPO_FECHA
    ON dbo.FORM_SOLICITUDES (TIP_SOLICITUD, FEC_REGI DESC);
  PRINT '[+] Índice IX_FORM_SOLIC_TIPO_FECHA creado.';
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.FORM_SOLICITUDES')
    AND name = 'IX_FORM_SOLIC_IDENT'
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_FORM_SOLIC_IDENT
    ON dbo.FORM_SOLICITUDES (NRO_IDENT);
  PRINT '[+] Índice IX_FORM_SOLIC_IDENT creado.';
END
GO

PRINT '[✓] Script formularios_schema.sql completado.';
