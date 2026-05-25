-- ============================================================
--  FIX_CUENTAS_BLOQUEADAS.sql
--  Propósito : Reparar cuentas atascadas por el bug de
--              verificación de email (ACT_INAC nunca se
--              actualizaba a 'A' al verificar el email).
--
--  Ejecutar  : En MineDax (producción) desde SSMS o Azure
--              Query Editor. Leer cada sección antes de
--              ejecutar. Se puede ejecutar en partes.
--  Fecha     : 2026-05-25
-- ============================================================

-- ──────────────────────────────────────────────────────────────
--  SECCIÓN 0: DIAGNÓSTICO (solo lectura — ejecutar primero)
-- ──────────────────────────────────────────────────────────────
SELECT
  COD_USUA,
  NOM_USUA,
  DIR_ELEC,
  ACT_INAC,
  IND_BLOQ,
  ACT_ESTA,
  VER_EMAIL,
  FEC_VERI,
  ACT_HORA,
  CASE
    WHEN VER_EMAIL = 'S' AND ACT_INAC != 'A'
      THEN '1 - VERIFICADO PERO INACTIVO (activar directo)'
    WHEN VER_EMAIL = 'N' AND FEC_VERI IS NOT NULL AND FEC_VERI < GETUTCDATE() AND ACT_INAC != 'A'
      THEN '2 - TOKEN EXPIRADO / NO VERIFICÓ (activar por admin)'
    WHEN VER_EMAIL = 'N' AND FEC_VERI IS NOT NULL AND FEC_VERI >= GETUTCDATE() AND ACT_INAC != 'A'
      THEN '3 - PENDIENTE DE VERIFICAR (token aún válido)'
    WHEN VER_EMAIL IS NULL AND ACT_INAC != 'A'
      THEN '4 - CUENTA LEGACY INACTIVA (revisar caso a caso)'
    WHEN ACT_INAC = 'A' AND IND_BLOQ = 'S'
      THEN '5 - ACTIVA PERO BLOQUEADA (desbloquear)'
    ELSE 'OK - SIN PROBLEMA'
  END AS DIAGNOSTICO
FROM GN_USUAR
WHERE ACT_ESTA = 'A'      -- Solo cuentas de sistema activas
ORDER BY ACT_HORA DESC;


-- ──────────────────────────────────────────────────────────────
--  SECCIÓN 1: Activar cuentas que YA verificaron el email
--  (VER_EMAIL = 'S') pero quedaron con ACT_INAC != 'A'
--  por el bug del controlador.
--  → Estas se activan sin necesidad de acción del usuario.
-- ──────────────────────────────────────────────────────────────
UPDATE GN_USUAR
SET
  ACT_INAC  = 'A',
  IND_BLOQ  = 'N',
  INT_FALL  = 0,
  FEC_ULCA  = GETDATE()
WHERE
  VER_EMAIL = 'S'
  AND ACT_INAC != 'A'
  AND ACT_ESTA  = 'A';

-- Ver cuántas filas se afectaron
SELECT @@ROWCOUNT AS [Cuentas activadas - Sección 1];


-- ──────────────────────────────────────────────────────────────
--  SECCIÓN 2: Activar cuentas cuyo token de verificación
--  ya expiró (FEC_VERI < GETUTCDATE()) y siguen inactivas.
--  El usuario no podrá usar el link del email (ya venció),
--  pero como acción de administrador se activan directamente
--  y se limpia el token para que puedan iniciar sesión.
-- ──────────────────────────────────────────────────────────────
UPDATE GN_USUAR
SET
  ACT_INAC  = 'A',
  VER_EMAIL = 'S',     -- Marcar como verificado (acción admin)
  TOK_VERI  = NULL,
  FEC_VERI  = NULL,
  IND_BLOQ  = 'N',
  INT_FALL  = 0,
  FEC_ULCA  = GETDATE()
WHERE
  VER_EMAIL  = 'N'
  AND FEC_VERI IS NOT NULL
  AND FEC_VERI < GETUTCDATE()
  AND ACT_INAC != 'A'
  AND ACT_ESTA  = 'A';

SELECT @@ROWCOUNT AS [Cuentas activadas - Sección 2 (token expirado)];


-- ──────────────────────────────────────────────────────────────
--  SECCIÓN 3: Desbloquear cuentas activas pero bloqueadas
--  (IND_BLOQ = 'S') con ACT_INAC = 'A'.
--  Estas se bloquean tras 5 intentos fallidos de contraseña.
--  Solo ejecutar si se quiere desbloquear manualmente.
-- ──────────────────────────────────────────────────────────────
-- COMENTADO POR DEFECTO — Descomentar solo si se requiere:
/*
UPDATE GN_USUAR
SET
  IND_BLOQ = 'N',
  INT_FALL = 0,
  FEC_ULCA = GETDATE()
WHERE
  ACT_INAC  = 'A'
  AND IND_BLOQ  = 'S'
  AND ACT_ESTA  = 'A';

SELECT @@ROWCOUNT AS [Cuentas desbloqueadas - Sección 3];
*/


-- ──────────────────────────────────────────────────────────────
--  SECCIÓN 4: Verificación final — ver estado de todas las
--  cuentas tras aplicar los fixes.
-- ──────────────────────────────────────────────────────────────
SELECT
  COD_USUA,
  RTRIM(NOM_USUA)   AS Nombre,
  RTRIM(DIR_ELEC)   AS Email,
  ACT_INAC          AS Estado,
  IND_BLOQ          AS Bloqueado,
  VER_EMAIL         AS EmailVerificado,
  INT_FALL          AS IntentosFallidos,
  FEC_ULCA          AS UltimaActividad
FROM GN_USUAR
WHERE ACT_ESTA = 'A'
ORDER BY ACT_HORA DESC;
