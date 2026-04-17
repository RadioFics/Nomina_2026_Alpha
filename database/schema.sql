-- Base de datos: MineDax
-- Tablas para el módulo de nómina

-- ===== TABLA: Ocasionales =====
CREATE TABLE Ocasionales (
  id NVARCHAR(36) PRIMARY KEY,
  cedula NVARCHAR(20) NOT NULL,
  nombre NVARCHAR(255) NOT NULL,
  novedad NVARCHAR(100),
  tipo NVARCHAR(50),
  cantidad DECIMAL(10, 2),
  valor DECIMAL(15, 2),
  observaciones NVARCHAR(MAX),
  periodo NVARCHAR(50),
  fechaRegistro DATETIME DEFAULT GETDATE(),
  INDEX IDX_cedula (cedula),
  INDEX IDX_periodo (periodo),
  INDEX IDX_fechaRegistro (fechaRegistro)
);

-- ===== TABLA: Fijas =====
CREATE TABLE Fijas (
  id NVARCHAR(36) PRIMARY KEY,
  cedula NVARCHAR(20) NOT NULL,
  nombre NVARCHAR(255) NOT NULL,
  novedad NVARCHAR(100),
  tipo NVARCHAR(50),
  aplicacion NVARCHAR(50),
  valor DECIMAL(15, 2),
  finicial DATE,
  ffinal DATE,
  cuotas INT,
  cuenta NVARCHAR(50),
  observaciones NVARCHAR(MAX),
  periodo NVARCHAR(50),
  fechaRegistro DATETIME DEFAULT GETDATE(),
  INDEX IDX_cedula (cedula),
  INDEX IDX_periodo (periodo),
  INDEX IDX_fechaRegistro (fechaRegistro)
);

-- ===== TABLA: Ausencias =====
CREATE TABLE Ausencias (
  id NVARCHAR(36) PRIMARY KEY,
  cedula NVARCHAR(20) NOT NULL,
  nombre NVARCHAR(255) NOT NULL,
  tipo NVARCHAR(50),
  diagnostico NVARCHAR(100),
  finicial DATE NOT NULL,
  ffinal DATE NOT NULL,
  dias INT,
  prorroga DATE,
  observaciones NVARCHAR(MAX),
  periodo NVARCHAR(50),
  fechaRegistro DATETIME DEFAULT GETDATE(),
  INDEX IDX_cedula (cedula),
  INDEX IDX_periodo (periodo),
  INDEX IDX_fechaRegistro (fechaRegistro)
);

-- ===== TABLA: Parametros (Configuración) =====
CREATE TABLE Parametros (
  id NVARCHAR(36) PRIMARY KEY,
  clave NVARCHAR(100) UNIQUE NOT NULL,
  valor NVARCHAR(MAX),
  descripcion NVARCHAR(500),
  fechaActualizacion DATETIME DEFAULT GETDATE()
);

-- ===== TABLA: Usuarios (Auditoría) =====
CREATE TABLE UsuariosLog (
  id NVARCHAR(36) PRIMARY KEY,
  usuario NVARCHAR(255),
  accion NVARCHAR(100),
  tabla NVARCHAR(100),
  recordId NVARCHAR(36),
  detalles NVARCHAR(MAX),
  fechaAccion DATETIME DEFAULT GETDATE(),
  INDEX IDX_usuario (usuario),
  INDEX IDX_fechaAccion (fechaAccion)
);
