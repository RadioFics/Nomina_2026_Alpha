-- ============================================================
-- SCRIPT DE CREACION DE BASE DE DATOS - NOVEDADES NOMINA
-- Empresa: Collective Mining | Proveedor: Adecco
-- Compatible con: Microsoft SQL Server 2019 / 2022 / 2025
-- ============================================================

USE master;
GO

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'NovedadesNomina')
    CREATE DATABASE NovedadesNomina;
GO

USE NovedadesNomina;
GO

-- ============================================================
-- TABLA: Empleados  (Maestro Original — 76 columnas fuente)
-- ============================================================
IF OBJECT_ID('dbo.Empleados','U') IS NOT NULL DROP TABLE dbo.Empleados;
GO

CREATE TABLE dbo.Empleados (
    -- PK
    Id                          INT IDENTITY(1,1) PRIMARY KEY,

    -- Identificación
    Codigo                      NVARCHAR(20),
    CodigoAlterno               NVARCHAR(20),
    Cedula                      NVARCHAR(20)  NOT NULL,
    TipoDocumento               NVARCHAR(10),

    -- Datos personales
    Nombre                      NVARCHAR(150) NOT NULL,
    Sexo                        NCHAR(1),
    GrupoSanguineo              NVARCHAR(5),
    FactorRH                    NVARCHAR(3),
    EstadoCivil                 NVARCHAR(20),
    CiudadExpedicion            NVARCHAR(80),
    Hijos                       INT           DEFAULT 0,
    FechaNacimiento             DATE,
    Ciudad                      NVARCHAR(80),
    Telefono1                   NVARCHAR(25),
    Telefono2                   NVARCHAR(25),
    Direccion                   NVARCHAR(200),
    Correo                      NVARCHAR(150),

    -- Cargo y salario
    Cargo                       NVARCHAR(150),
    Porcentaje                  DECIMAL(10,6),
    Salario                     DECIMAL(15,2),
    ValorHora                   DECIMAL(10,2),

    -- Cuenta bancaria
    TipoCuenta                  NVARCHAR(50),
    Banco                       NVARCHAR(100),
    NumeroCuenta                NVARCHAR(50),
    Sucursal                    NVARCHAR(100),

    -- Centro de costos y compañía
    CentroCosto                 NVARCHAR(50),
    CentroCostos                NVARCHAR(50),
    CodigoCompania              NVARCHAR(10),
    CuentaGasto                 NVARCHAR(50),

    -- Parámetros de liquidación
    Regimen                     NVARCHAR(30),
    TrabajaSabado               NVARCHAR(10),
    ClaseSalario                NVARCHAR(30),
    Pensionado                  NVARCHAR(5),
    AplicaLey1393               NVARCHAR(5),
    ModoLiquidacion             NVARCHAR(30),
    TipoLiquidacion             NVARCHAR(30),
    Extranjero                  NVARCHAR(5),
    ResideExtranjero            NVARCHAR(5),

    -- Fechas laborales
    FechaIngreso                DATE,
    FechaRetiro                 DATE,
    FechaFinal                  DATE,
    CausaRetiro                 NVARCHAR(100),
    Contrato                    NVARCHAR(20),
    TipoContrato                NVARCHAR(20),

    -- Retención en la fuente y deducciones
    PorcentajeRete              DECIMAL(6,3),
    ValorDeduccionVivienda      DECIMAL(15,2),
    ValorDeduccionSalud         DECIMAL(15,2),
    ValorDeduccionDependientes  DECIMAL(15,2),
    DeclaraRenta                NVARCHAR(5),
    PromedioSalud               DECIMAL(15,2),

    -- Seguridad social
    EPS                         NVARCHAR(100),
    AFP                         NVARCHAR(100),
    Caja                        NVARCHAR(100),
    ARP                         NVARCHAR(150),
    Cesantias                   NVARCHAR(100),
    Riesgo                      DECIMAL(6,3),

    -- Configuración horaria y vacaciones
    HorasMes                    INT,
    DiasVacaciones              INT,

    -- Clasificadores internos
    Clasificador1               NVARCHAR(30),
    Clasificador1Nom            NVARCHAR(100),
    SubArea                     NVARCHAR(50),
    SubAreaNom                  NVARCHAR(100),
    NivelCargo                  NVARCHAR(50),
    DriverVariable              NVARCHAR(50),
    Clasificador7               NVARCHAR(30),
    Clasificador7Nom            NVARCHAR(100),
    PagoXDias                   NVARCHAR(10),
    RelacionSindical            NVARCHAR(50),

    -- Auditoría
    FechaCreacion               DATETIME      DEFAULT GETDATE(),
    FechaModificacion           DATETIME      DEFAULT GETDATE(),

    CONSTRAINT UQ_Empleados_Cedula UNIQUE (Cedula)
);
GO

-- ============================================================
-- TABLA: NovedadesOcasionales  (hoja Ocasionales)
-- ============================================================
IF OBJECT_ID('dbo.NovedadesOcasionales','U') IS NOT NULL DROP TABLE dbo.NovedadesOcasionales;
GO
CREATE TABLE dbo.NovedadesOcasionales (
    Id              INT IDENTITY(1,1) PRIMARY KEY,
    Identificacion  NVARCHAR(20)  NOT NULL,
    Nombre          NVARCHAR(150),
    Novedad         NVARCHAR(100),
    TipoNovedad     NVARCHAR(100),
    Cantidad        DECIMAL(10,4),
    Valor           DECIMAL(15,2),
    Observaciones   NVARCHAR(500),
    PeriodoNomina   NVARCHAR(30),
    FechaRegistro   DATETIME      DEFAULT GETDATE(),
    UsuarioRegistro NVARCHAR(100),
    CONSTRAINT FK_Ocas_Emp FOREIGN KEY (Identificacion) REFERENCES dbo.Empleados(Cedula)
);
GO

-- ============================================================
-- TABLA: NovedadesFijas  (hoja Fijas)
-- ============================================================
IF OBJECT_ID('dbo.NovedadesFijas','U') IS NOT NULL DROP TABLE dbo.NovedadesFijas;
GO
CREATE TABLE dbo.NovedadesFijas (
    Id              INT IDENTITY(1,1) PRIMARY KEY,
    Identificacion  NVARCHAR(20)  NOT NULL,
    Nombre          NVARCHAR(150),
    Novedad         NVARCHAR(100),
    TipoNovedad     NVARCHAR(100),
    Cantidad        DECIMAL(10,4),
    Valor           DECIMAL(15,2),
    FechaInicial    DATE,
    FechaFinal      DATE,
    Aplicacion      NVARCHAR(20),
    Cuenta          NVARCHAR(50),
    Cuotas          INT,
    Observaciones   NVARCHAR(500),
    PeriodoNomina   NVARCHAR(30),
    FechaRegistro   DATETIME      DEFAULT GETDATE(),
    UsuarioRegistro NVARCHAR(100),
    CONSTRAINT FK_Fij_Emp FOREIGN KEY (Identificacion) REFERENCES dbo.Empleados(Cedula)
);
GO

-- ============================================================
-- TABLA: Ausentismos  (hoja Ausentismos Vacaciones)
-- ============================================================
IF OBJECT_ID('dbo.Ausentismos','U') IS NOT NULL DROP TABLE dbo.Ausentismos;
GO
CREATE TABLE dbo.Ausentismos (
    Id              INT IDENTITY(1,1) PRIMARY KEY,
    Identificacion  NVARCHAR(20)  NOT NULL,
    Nombre          NVARCHAR(150),
    TipoAusentismo  NVARCHAR(100),
    FechaInicial    DATE          NOT NULL,
    FechaFinal      DATE          NOT NULL,
    DiasTotales     INT,
    Diagnostico     NVARCHAR(200),
    Prorroga        DATE,
    Observaciones   NVARCHAR(500),
    PeriodoNomina   NVARCHAR(30),
    FechaRegistro   DATETIME      DEFAULT GETDATE(),
    UsuarioRegistro NVARCHAR(100),
    CONSTRAINT FK_Aus_Emp FOREIGN KEY (Identificacion) REFERENCES dbo.Empleados(Cedula)
);
GO

-- ============================================================
-- TABLA: CambiosMaestro  (hoja Cambios Maestro)
-- ============================================================
IF OBJECT_ID('dbo.CambiosMaestro','U') IS NOT NULL DROP TABLE dbo.CambiosMaestro;
GO
CREATE TABLE dbo.CambiosMaestro (
    Id               INT IDENTITY(1,1) PRIMARY KEY,
    Cedula           NVARCHAR(20)  NOT NULL,
    Nombre           NVARCHAR(150),
    TipoDocumento    NVARCHAR(10),
    CiudadExpedicion NVARCHAR(80),
    EstadoCivil      NVARCHAR(30),
    FechaNacimiento  DATE,
    Ciudad           NVARCHAR(80),
    PeriodoNomina    NVARCHAR(30),
    FechaRegistro    DATETIME      DEFAULT GETDATE(),
    UsuarioRegistro  NVARCHAR(100)
);
GO

-- ============================================================
-- TABLA: CambiosIngresos  (hoja Cambios e Ingresos)
-- ============================================================
IF OBJECT_ID('dbo.CambiosIngresos','U') IS NOT NULL DROP TABLE dbo.CambiosIngresos;
GO
CREATE TABLE dbo.CambiosIngresos (
    Id              INT IDENTITY(1,1) PRIMARY KEY,
    Identificacion  NVARCHAR(20)  NOT NULL,
    Nombre          NVARCHAR(150),
    TipoCambio      NVARCHAR(100),
    FechaInicial    DATE,
    CambioA         NVARCHAR(200),
    Observaciones   NVARCHAR(500),
    PeriodoNomina   NVARCHAR(30),
    FechaRegistro   DATETIME      DEFAULT GETDATE(),
    UsuarioRegistro NVARCHAR(100),
    CONSTRAINT FK_CI_Emp FOREIGN KEY (Identificacion) REFERENCES dbo.Empleados(Cedula)
);
GO

-- ============================================================
-- TABLA: MatrizConceptos  (catalogo de novedades validas)
-- ============================================================
IF OBJECT_ID('dbo.MatrizConceptos','U') IS NOT NULL DROP TABLE dbo.MatrizConceptos;
GO
CREATE TABLE dbo.MatrizConceptos (
    Id              INT IDENTITY(1,1) PRIMARY KEY,
    Categoria       NVARCHAR(30),
    Modalidad       NVARCHAR(20),
    Codigo          NVARCHAR(20),
    Aplicacion      NVARCHAR(30),
    Descripcion     NVARCHAR(200),
    RequiereCantidad NCHAR(1),
    RequiereValor   NCHAR(1)
);
GO

-- ============================================================
-- DATOS INICIALES: Catalogo de conceptos
-- ============================================================
INSERT INTO dbo.MatrizConceptos (Categoria,Modalidad,Codigo,Aplicacion,Descripcion,RequiereCantidad,RequiereValor) VALUES
-- Ocasionales - Devengos
('Ocasionales','DEVENGO','001052','Normal','Ajuste de Salario','N','S'),
('Ocasionales','DEVENGO','001300','Normal','Auxilio de Transporte o Conectividad','N','S'),
('Ocasionales','DEVENGO','001157','Normal','Bonificacion No Salarial','N','S'),
('Ocasionales','DEVENGO','001610','Normal','Bonificacion Por Retiro','N','S'),
('Ocasionales','DEVENGO','001530','Normal','Cesantias Parciales','N','S'),
('Ocasionales','DEVENGO','001070','Normal','Descanso compensatorio','S','S'),
('Ocasionales','DEVENGO','001067','Normal','Hora Dominical o Festiva Ordinaria 175%','S','N'),
('Ocasionales','DEVENGO','001063','Normal','Hora Extra Dominical o Festiva Diurna 200%','S','N'),
('Ocasionales','DEVENGO','001064','Normal','Hora Extra Dominical o Festiva Nocturna 250%','S','N'),
('Ocasionales','DEVENGO','001061','Normal','Horas Extras Diurnas 125%','S','N'),
('Ocasionales','DEVENGO','001062','Normal','Horas Extras Nocturnas 175%','S','N'),
('Ocasionales','DEVENGO','001535','Normal','Intereses Cesantias Parciales','N','S'),
('Ocasionales','DEDUCCION','002520','Normal','Prestamo Compania','N','S'),
('Ocasionales','DEVENGO','001501','Normal','Prima Servicios Ajuste','N','S'),
('Ocasionales','DEVENGO','001060','Normal','Recargo Nocturno 35%','S','N'),
-- Fijas - Deducciones AFC
('Fijas','DEDUCCION','282269','Normal','AFC AVVillas','N','S'),
('Fijas','DEDUCCION','282264','Normal','AFC Bancolombia','N','S'),
('Fijas','DEDUCCION','282265','Normal','AFC BBVA','N','S'),
('Fijas','DEDUCCION','282266','Normal','AFC Colmena','N','S'),
('Fijas','DEDUCCION','282262','Normal','AFC Colpatria','N','S'),
('Fijas','DEDUCCION','282270','Normal','AFC Coomeva','N','S'),
('Fijas','DEDUCCION','282263','Normal','AFC Davivienda','N','S'),
('Fijas','DEDUCCION','282271','Normal','AFC FNA','N','S'),
('Fijas','DEDUCCION','282268','Normal','AFC Helm Bank','N','S'),
('Fijas','DEDUCCION','282267','Normal','AFC ING','N','S'),
('Fijas','DEDUCCION','282256','Normal','AFC Old Mutual','N','S'),
('Fijas','DEDUCCION','282261','Normal','APV BBVA Horizonte','N','S'),
('Fijas','DEDUCCION','282260','Normal','APV Colfondos','N','S'),
('Fijas','DEDUCCION','282254','Normal','APV Dafuturo','N','S'),
('Fijas','DEDUCCION','282258','Normal','APV ING','N','S');
GO

-- ============================================================
-- INDICES
-- ============================================================
CREATE INDEX IX_Ocas_Id     ON dbo.NovedadesOcasionales(Identificacion);
CREATE INDEX IX_Ocas_Per    ON dbo.NovedadesOcasionales(PeriodoNomina);
CREATE INDEX IX_Fij_Id      ON dbo.NovedadesFijas(Identificacion);
CREATE INDEX IX_Fij_Per     ON dbo.NovedadesFijas(PeriodoNomina);
CREATE INDEX IX_Aus_Id      ON dbo.Ausentismos(Identificacion);
CREATE INDEX IX_Aus_Per     ON dbo.Ausentismos(PeriodoNomina);
CREATE INDEX IX_CI_Id       ON dbo.CambiosIngresos(Identificacion);
CREATE INDEX IX_CM_Ced      ON dbo.CambiosMaestro(Cedula);
CREATE INDEX IX_Emp_Nombre  ON dbo.Empleados(Nombre);
GO

-- ============================================================
-- VISTAS UTILES
-- ============================================================
GO
CREATE OR ALTER VIEW dbo.vw_ResumenPorEmpleado AS
    SELECT
        e.Cedula, e.Nombre, e.Cargo, e.EPS, e.AFP, e.FechaIngreso,
        (SELECT COUNT(*) FROM dbo.NovedadesOcasionales WHERE Identificacion = e.Cedula) AS TotalOcasionales,
        (SELECT COUNT(*) FROM dbo.NovedadesFijas       WHERE Identificacion = e.Cedula) AS TotalFijas,
        (SELECT COUNT(*) FROM dbo.Ausentismos          WHERE Identificacion = e.Cedula) AS TotalAusentismos,
        (SELECT COUNT(*) FROM dbo.CambiosIngresos      WHERE Identificacion = e.Cedula) AS TotalCambios
    FROM dbo.Empleados e;
GO

CREATE OR ALTER VIEW dbo.vw_NovedadesCompletas AS
    SELECT 'Ocasional' AS TipoRegistro, o.PeriodoNomina, o.Identificacion,
           e.Nombre, e.Cargo, o.Novedad AS Concepto,
           o.TipoNovedad, o.Cantidad, o.Valor, NULL AS FechaInicial, NULL AS FechaFinal,
           o.Observaciones, o.FechaRegistro
    FROM dbo.NovedadesOcasionales o
    LEFT JOIN dbo.Empleados e ON e.Cedula = o.Identificacion
    UNION ALL
    SELECT 'Fija', f.PeriodoNomina, f.Identificacion,
           e.Nombre, e.Cargo, f.Novedad,
           f.TipoNovedad, f.Cantidad, f.Valor, f.FechaInicial, f.FechaFinal,
           f.Observaciones, f.FechaRegistro
    FROM dbo.NovedadesFijas f
    LEFT JOIN dbo.Empleados e ON e.Cedula = f.Identificacion
    UNION ALL
    SELECT 'Ausentismo', a.PeriodoNomina, a.Identificacion,
           e.Nombre, e.Cargo, a.TipoAusentismo,
           NULL, a.DiasTotales, NULL, a.FechaInicial, a.FechaFinal,
           a.Observaciones, a.FechaRegistro
    FROM dbo.Ausentismos a
    LEFT JOIN dbo.Empleados e ON e.Cedula = a.Identificacion;
GO

PRINT 'Base de datos NovedadesNomina creada exitosamente con todas las tablas, indices y vistas.';
GO
