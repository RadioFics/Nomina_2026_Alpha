# 📋 PLAN DE ACCIÓN: Reparación Login Usuario HL

**Estado**: 🟡 En proceso  
**Fecha**: 2026-04-13  
**Usuario afectado**: HL (HERNANDEZ LARGO JUAN FELIPE, Cédula: 1007808313)  
**Problema principal**: Hash bcrypt incompleto (11 caracteres en lugar de 60+)

---

## 🎯 Objetivo Final

✅ Usuario HL podrá hacer login a la interfaz web con credenciales válidas

---

## 📊 Resumen de Problemas Identificados

| Problema | Estado | Severidad | Solución |
|----------|--------|-----------|----------|
| Hash bcrypt incompleto | ❌ CRÍTICO | 🔴 Bloquea login | Generar hash válido |
| Otras condiciones | ✅ Verificar | 🟢 Normal | Validar con script |
| Integración Claude Code-BD | ⚠️ No existe | 🟡 Mejora | Implementar MCP |

---

## 🔧 OPCIÓN 1: Workflow Híbrido (RECOMENDADO - FUNCIONA HOY)

### Tiempo estimado: 30 minutos
### Pasos:

#### ✅ Paso 1: Generar Hash en Claude Code (5 min)

```bash
# Abre terminal en VSCode (Ctrl+`)
# Navega a la carpeta del proyecto
cd "C:\Users\JuanEstebanCalle\OneDrive - Collective Mining C-Suite\Documentos\Collective Mining\Marzo 2026\Nómina\Apps\Interfaz Nomina - Alpha"

# Instala dependencia
npm install bcryptjs

# Genera hash para contraseña temporal
node generate-bcrypt-hash.js "Temporal@123"
```

**Resultado**: Obtendrás un hash como:
```
$2b$12$ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ1234
```

**Copia este hash** 📋

---

#### ✅ Paso 2: Reparar en BD (Claude Desktop) (10 min)

1. **Abre Claude Desktop**
2. **Pega este prompt** (reemplaza el hash):

```
Necesito reparar el login del usuario HL en la BD MineDax.

El problema: El hash bcrypt está incompleto (11 chars en lugar de 60+).

He generado un nuevo hash: [PEGA_EL_HASH_QUE_GENERASTE]

Ejecuta estos pasos:

1. VERIFICACIÓN ACTUAL:
SELECT 
    COD_USUA, ABR_USUA, NOM_USUA,
    LEN(PAS_HASH) as hash_chars,
    ACT_INAC, USU_TWEB, IND_BLOQ, FEC_EXPI
FROM GN_USUAR
WHERE RTRIM(ABR_USUA) = 'HL'

2. ACTUALIZACIÓN:
UPDATE GN_USUAR
SET 
    PAS_HASH = '[PEGA_EL_HASH_QUE_GENERASTE]',
    INT_FALL = 0,
    CAM_PASS = NULL
WHERE RTRIM(ABR_USUA) = 'HL'

3. VALIDACIÓN:
SELECT 
    ABR_USUA, NOM_USUA,
    CASE WHEN LEN(PAS_HASH) >= 60 THEN '✅ VÁLIDO' ELSE '❌ INVÁLIDO' END as hash_state,
    ACT_INAC, USU_TWEB, IND_BLOQ,
    CASE
        WHEN ACT_INAC = 'A' AND USU_TWEB = 'S' AND IND_BLOQ = 'N' 
         AND LEN(PAS_HASH) >= 60 AND (FEC_EXPI IS NULL OR FEC_EXPI >= GETDATE())
        THEN '✅ PUEDE LOGUEAR'
        ELSE '❌ NO PUEDE LOGUEAR'
    END as resultado
FROM GN_USUAR
WHERE RTRIM(ABR_USUA) = 'HL'
```

Claude Desktop ejecutará los comandos contra la BD y mostrará los resultados.

---

#### ✅ Paso 3: Validación Completa (5 min)

Copia los **resultados** de Claude Desktop aquí y yo:
- ✅ Verificaré que el hash es válido
- ✅ Confirmaré que todas las condiciones se cumplen
- ✅ Crearé documento de evidencia
- ✅ Documentaré el procedimiento

---

## 🔌 OPCIÓN 2: MCP Proxy para Claude Code (PRÓXIMA SEMANA)

### Ventaja
Desde VSCode podrás hacer queries directas sin copiar-pegar

### Tiempo estimado: 1 hora (configuración única)

### Pasos:

1. **Instalar proxy MCP**
```bash
npm install -g @anthropic/mcp-sql-server
```

2. **Configurar en VSCode**
   - Presiona `Ctrl+Shift+P`
   - Busca: `Claude Code: Configure MCP`
   - Agregar servidor SQL Server

3. **Resultado**: Desde Claude Code:
```
@sql ¿Cuál es el estado del usuario HL?
```

---

## 🚀 OPCIÓN 3: API REST Intermediaria (FUTURO)

### Para: Integración completa cliente-servidor

### Ventaja
Agnóstico de tecnología, escalable

### Tiempo estimado: 2 horas (desarrollo + testing)

---

## 📋 Archivos Generados

| Archivo | Propósito | Cuándo usar |
|---------|-----------|------------|
| `SCRIPT_REPARACION_LOGIN_HL.sql` | Reparación del usuario HL | Paso 2 (Claude Desktop) |
| `VALIDACION_COMPLETA_TODOS_USUARIOS.sql` | Diagnóstico de todos los usuarios | Después de reparar HL |
| `generate-bcrypt-hash.js` | Genera hash bcrypt válido | Paso 1 (Claude Code) |
| `INTEGRACION_CLAUDE_CODE_BD.md` | Guía de integración MCP | Opción 2 |
| `PROMPT_CLAUDE_DESKTOP_BD.md` | Prompt para Claude Desktop | Referencia |

---

## ✅ Checklist de Ejecución

### HOY - Opción 1 (Workflow Híbrido)

- [ ] **Paso 1**: Generar hash en Claude Code
  - [ ] Instalar `bcryptjs`
  - [ ] Ejecutar `generate-bcrypt-hash.js`
  - [ ] Copiar hash generado
  
- [ ] **Paso 2**: Reparar en Claude Desktop
  - [ ] Pegar prompt con el hash
  - [ ] Ejecutar verificación actual
  - [ ] Ejecutar actualización
  - [ ] Ejecutar validación
  - [ ] Copiar resultados
  
- [ ] **Paso 3**: Validar en Claude Code
  - [ ] Pegar resultados aquí
  - [ ] Confirmar éxito
  - [ ] Documentar procedimiento

### PRÓXIMA SEMANA - Opción 2 (MCP Proxy)

- [ ] Instalar `@anthropic/mcp-sql-server`
- [ ] Configurar en VSCode settings.json
- [ ] Probar query de prueba
- [ ] Documentar en CLAUDE.md

---

## 🔐 Consideraciones de Seguridad

✅ **Lo que haremos**:
- Hash bcrypt con salt_rounds = 12 (OWASP recomendado)
- Respetar integridad de datos (no sobrescribir sin validación)
- Crear logs de auditoría
- Usar contraseña temporal (usuario debe cambiar en primer login)

❌ **Nunca hacer**:
- Almacenar passwords en texto plano
- Compartir hashes en canales inseguros
- Usar hashes débiles (MD5, SHA1)
- Modificar campos sin auditoría

---

## 📞 Próximos Pasos

1. **Elige Opción 1** (recomendado para hoy)
2. **Ejecuta Paso 1** (generar hash)
3. **Ejecuta Paso 2** (reparar en BD)
4. **Ejecuta Paso 3** (validar)
5. **Elige Opción 2** si quieres integración permanente

---

## 📝 Documentación Referencia

- [SCRIPT_REPARACION_LOGIN_HL.sql](SCRIPT_REPARACION_LOGIN_HL.sql) - Script SQL
- [VALIDACION_COMPLETA_TODOS_USUARIOS.sql](VALIDACION_COMPLETA_TODOS_USUARIOS.sql) - Diagnóstico completo
- [INTEGRACION_CLAUDE_CODE_BD.md](INTEGRACION_CLAUDE_CODE_BD.md) - Guía integración
- [PROMPT_CLAUDE_DESKTOP_BD.md](PROMPT_CLAUDE_DESKTOP_BD.md) - Prompt para Desktop

---

**Status**: 🟡 Pendiente Paso 1  
**Asignado a**: Juan Esteban Calle  
**Prioridad**: 🔴 ALTA (bloquea acceso)  
**Fecha objetivo**: Hoy (2026-04-13)

