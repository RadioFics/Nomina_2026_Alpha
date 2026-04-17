# 🔍 DIAGNÓSTICO - Login No Funciona

## Resumen del Problema

✅ Registro funciona - usuario se crea en BD
✅ Se puede crear usuario inmediatamente  
❌ Login falla - no permite acceder
❌ La lectura no parece ser eficiente

## Cambios Implementados para Diagnosticar

He mejorado el proceso de login agregando:

### 1️⃣ Query de Diagnóstico Sin JOINs

**Objetivo:** Verificar que el usuario existe en GN_USUAR sin complicaciones

```sql
SELECT TOP 1
  u.COD_USUA, u.COD_EMPR, u.NOM_USUA, u.DIR_ELEC,
  u.PAS_HASH, u.ACT_INAC, u.IND_BLOQ, u.INT_FALL,
  u.COD_FUNCI, u.COD_GUSU
FROM GN_USUAR u
WHERE RTRIM(LTRIM(u.DIR_ELEC)) = RTRIM(LTRIM(@email))
```

**Mejoras:**
- `RTRIM(LTRIM())` → Elimina espacios en blanco (importante para campos CHAR)
- Sin JOINs → Si falla aquí, el problema es que no existe el usuario
- Si pasa → El usuario existe en GN_USUAR

### 2️⃣ Logs de Diagnóstico Mejorados

Cuando intentas login, verás en la consola:

```
[LOGIN] ✓ Usuario encontrado: [NOM_USUA] (COD_USUA: [número])
[LOGIN] Estado: ACT_INAC=[S/N], IND_BLOQ=[S/N], PAS_HASH=[***SET*** o NULL]
```

**Esto te dirá:**
- ✅ Si el usuario existe en BD
- ✅ Si ACT_INAC='S' (activo)
- ✅ Si IND_BLOQ='N' (desbloqueado)
- ✅ Si PAS_HASH tiene valor o está NULL

### 3️⃣ Query de Login Mejorada con JOINs Correctos

Después del diagnóstico, busca datos completos:

```sql
SELECT TOP 1 ...
FROM GN_USUAR u
LEFT JOIN GN_FUNCI f ON u.COD_FUNCI = f.COD_FUNCI AND f.COD_EMPR = u.COD_EMPR
LEFT JOIN GN_TERCE t ON f.COD_TERC = t.COD_TERC AND t.COD_EMPR = u.COD_EMPR
LEFT JOIN GN_GUSUA g ON u.COD_GUSU = g.COD_GUSU
WHERE RTRIM(LTRIM(u.DIR_ELEC)) = RTRIM(LTRIM(@email))
```

**Mejoras:**
- Agregado `AND f.COD_EMPR = u.COD_EMPR` en JOIN con GN_FUNCI
- Agregado `AND t.COD_EMPR = u.COD_EMPR` en JOIN con GN_TERCE
- `RTRIM(LTRIM())` en WHERE clause

## Cómo Diagnosticar el Problema

### Paso 1: Reinicia el servidor
```bash
npm start
```

### Paso 2: Intenta hacer login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "cedula_o_email": "usuario@ejemplo.com",
    "contrasena": "Password123"
  }'
```

### Paso 3: Revisa la consola del servidor

Deberías ver algo como:

#### Escenario A: Usuario NO encontrado
```
[LOGIN] Usuario usuario@ejemplo.com no encontrado en GN_USUAR
```

**Significa:** El usuario no está en la BD o el email está diferente
**Solución:** Verifica que el usuario se registró correctamente y que el email coincide

#### Escenario B: Usuario encontrado pero PAS_HASH es NULL
```
[LOGIN] ✓ Usuario encontrado: Juan Pérez (COD_USUA: 123)
[LOGIN] Estado: ACT_INAC=S, IND_BLOQ=N, PAS_HASH=NULL
[LOGIN] Usuario usuario@ejemplo.com no tiene hash de contraseña
```

**Significa:** El registro no guardó correctamente el hash de la contraseña
**Solución:** Revisa el proceso de registro en authController.js línea 1039-1059

#### Escenario C: Usuario encontrado, ACT_INAC='N'
```
[LOGIN] ✓ Usuario encontrado: Juan Pérez (COD_USUA: 123)
[LOGIN] Estado: ACT_INAC=N, IND_BLOQ=N, PAS_HASH=***SET***
[LOGIN] Usuario usuario@ejemplo.com inactivo
```

**Significa:** El usuario está marcado como inactivo
**Solución:** Revisa si el registro está insertando ACT_INAC='S'

#### Escenario D: Todo parece correcto pero login falla
```
[LOGIN] ✓ Usuario encontrado: Juan Pérez (COD_USUA: 123)
[LOGIN] Estado: ACT_INAC=S, IND_BLOQ=N, PAS_HASH=***SET***
[LOGIN ERROR] ...
```

**Significa:** El error está en comparación de contraseña o algún otro paso
**Información:** El error exacto aparecerá en `[LOGIN ERROR]`

## Problemas Identificados Previamente

### ❌ Problema 1: COD_GUSU es BIGINT pero se esperaba SMALLINT
- **En BD:** `[COD_GUSU] [bigint] NULL`
- **En código:** Insertar `COD_GUSU = 2`
- **Estado:** ✅ SQL Server puede convertir implícitamente

### ❌ Problema 2: DIR_ELEC es CHAR(100)
- **En BD:** `[DIR_ELEC] [char](100) NULL`
- **Problema:** Los CHAR se rellenan con espacios
- **Solución:** ✅ Usamos `RTRIM(LTRIM())` para limpiar espacios

### ❌ Problema 3: LEFT JOINs sin COD_EMPR
- **Antes:** `LEFT JOIN GN_FUNCI f ON u.COD_FUNCI = f.COD_FUNCI`
- **Problema:** Podría unir registros incorrectos
- **Solución:** ✅ `AND f.COD_EMPR = u.COD_EMPR`

### ❌ Problema 4: COD_FUNCI era NULL en registro
- **Antes:** Se insertaba `COD_FUNCI = NULL`
- **Solución:** ✅ Ahora se busca en GN_FUNCI usando COD_TERC

## Campos Obligatorios en GN_USUAR

| Campo | Tipo | Nullable | Default | Status |
|-------|------|----------|---------|--------|
| COD_EMPR | smallint | ❌ NO | 1 | ✅ |
| COD_USUA | bigint | ❌ NO | IDENTITY | ✅ |
| NOM_USUA | char(240) | ❌ NO | - | ✅ |
| ACT_USUA | char(8) | ❌ NO | 'MineDax' | ✅ |
| ACT_HORA | datetime | ❌ NO | GETDATE() | ✅ |
| ACT_ESTA | char(1) | ❌ NO | 'A' | ✅ |
| DIR_ELEC | char(100) | ✅ SI | - | ✅ |
| PAS_HASH | varchar(255) | ✅ SI | - | ✅ |
| ACT_INAC | char(1) | ✅ SI | - | ✅ (INSERT='S') |
| IND_BLOQ | char(1) | ✅ SI | 'N' | ✅ |
| COD_FUNCI | int | ✅ SI | - | ✅ (busca en GN_FUNCI) |
| COD_GUSU | bigint | ✅ SI | - | ✅ (INSERT=2) |

## Próximos Pasos

1. **Ejecuta el servidor con los cambios nuevos**
2. **Registra un usuario nuevo (test@email.com)**
3. **Intenta hacer login inmediatamente**
4. **Revisa los logs en la consola del servidor**
5. **Reporta cuál escenario (A, B, C o D) ves**

Con esa información podré identificar exactamente dónde está fallando.

---

**Archivo modificado:** `controllers/authController.js` líneas 16-92
**Mejoras:**
- ✅ Query de diagnóstico sin JOINs
- ✅ RTRIM(LTRIM()) en búsquedas
- ✅ COD_EMPR en JOINs
- ✅ Logs de diagnóstico detallados
