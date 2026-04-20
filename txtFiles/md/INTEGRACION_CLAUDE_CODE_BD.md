# 🔌 Integración Claude Code ↔ Base de Datos MineDax

## Estado Actual

- **Claude Desktop**: ✅ Tiene acceso a BD via MCP SQL Server
- **Claude Code** (VSCode Extension): ❌ No tiene acceso directo a BD
- **Necesidad**: Conectar ambos para flujo completo

---

## 🎯 Opciones de Integración

### OPCIÓN 1: Workflow Híbrido (RECOMENDADO - Hoy)
**Ventaja**: Funciona ahora, sin cambios de config  
**Desventaja**: Requiere copiar-pegar entre herramientas

#### Flujo:
```
1. Claude Code (VSCode)
   ↓
   Genera script SQL (SCRIPT_REPARACION_LOGIN_HL.sql)
   ↓
2. Copias el script
   ↓
3. Claude Desktop
   ↓
   Ejecuta en la BD
   ↓
4. Recibes resultados
   ↓
5. Claude Code valida/documenta
```

#### Implementación:

**Paso 1: Generar Hash en Claude Code**
```bash
# En VSCode terminal (en esta carpeta)
npm install bcryptjs

# Generar hash para usuario HL
node generate-bcrypt-hash.js "Temporal@123"

# Output:
# $2b$12$HASH_AQUI_60_CARACTERES
```

**Paso 2: Copiar script SQL**
```sql
-- Copia todo el contenido de: SCRIPT_REPARACION_LOGIN_HL.sql
-- Pégalo en Claude Desktop o SSMS
```

**Paso 3: Validar en Claude Desktop**
```
Pega esto en Claude Desktop:

Necesito ejecutar el diagnóstico de login para el usuario HL 
después de aplicar el hash bcrypt. 

El hash es: [PASTE_HASH_AQUI]

Usa el script que te paso para validar que ahora el usuario 
puede iniciar sesión. Muéstrame las 5 condiciones de login.
```

---

### OPCIÓN 2: MCP Proxy para Claude Code (PRÓXIMAMENTE)
**Ventaja**: Acceso directo desde VSCode  
**Desventaja**: Requiere configuración adicional

#### Cómo configurar:

**Paso 1: Instalar proxy MCP**
```bash
npm install -g @anthropic/mcp-sql-server
```

**Paso 2: Crear archivo `mcp_config.json` en la carpeta del proyecto**
```json
{
  "mcpServers": {
    "sql-server": {
      "command": "mcp-sql-server",
      "args": [
        "--server", "CM-ITD-P-05\\SQLEXPRESS",
        "--database", "MineDax",
        "--trusted-auth"
      ],
      "disabled": false
    }
  }
}
```

**Paso 3: Configurar Claude Code para usar este MCP**
```bash
# En VSCode, presiona Ctrl+Shift+P
# Escribe: Claude Code: Configure MCP
# Selecciona: Agregar servidor
# Nombre: sql-server
# Archivo config: mcp_config.json
```

**Resultado**: Desde Claude Code podrás hacer queries directas:
```
@claude-code ¿Cuál es el estado del usuario HL?
```

---

### OPCIÓN 3: API REST Intermediaria (FUTURO)
**Ventaja**: Agnóstico de tecnología  
**Desventaja**: Requiere servidor adicional

#### Arquitectura:
```
Claude Code
    ↓
  (API REST)
    ↓
  Servidor Node.js
    ↓
  (Pool SQL Server)
    ↓
  MineDax BD
```

#### Implementación básica:

**Crear archivo `api-bd.js`**:
```javascript
const express = require('express');
const sql = require('mssql');

const config = {
  server: 'CM-ITD-P-05\\SQLEXPRESS',
  database: 'MineDax',
  authentication: { type: 'default' },
  options: { encrypt: true, trustServerCertificate: true }
};

const app = express();
const pool = new sql.ConnectionPool(config);
const poolConnect = pool.connect();

// Endpoint: Diagnosticar usuario
app.get('/api/usuarios/:login/diagnostico', async (req, res) => {
  const { login } = req.params;
  
  try {
    await poolConnect;
    const result = await pool.request()
      .input('login', sql.VarChar, login)
      .query(`
        SELECT 
          COD_USUA, ABR_USUA, NOM_USUA,
          ACT_INAC, USU_TWEB, IND_BLOQ,
          CASE WHEN LEN(PAS_HASH) >= 60 THEN 'VÁLIDO' ELSE 'INCOMPLETO' END as hash_state
        FROM GN_USUAR
        WHERE RTRIM(ABR_USUA) = @login
      `);
    
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Actualizar hash
app.post('/api/usuarios/:id/hash', async (req, res) => {
  const { id } = req.params;
  const { hash } = req.body;
  
  try {
    await poolConnect;
    await pool.request()
      .input('id', sql.Int, id)
      .input('hash', sql.VarChar, hash)
      .query(`
        UPDATE GN_USUAR SET PAS_HASH = @hash WHERE COD_USUA = @id
      `);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('API BD escuchando en :3000'));
```

**Uso desde Claude Code**:
```
curl http://localhost:3000/api/usuarios/HL/diagnostico
```

---

## 📋 Plan de Implementación

### HOJA DE RUTA
```
HOY (Opción 1 - Híbrida):
├── 1. Generar hash en Claude Code
├── 2. Ejecutar script SQL en Claude Desktop
└── 3. Validar resultados

SEMANA 1 (Opción 2 - MCP Proxy):
├── 1. Instalar MCP proxy
├── 2. Configurar en settings.json de VSCode
└── 3. Probar queries directo desde Claude Code

SEMANA 2 (Opción 3 - API REST):
├── 1. Crear servidor Node.js
├── 2. Implementar endpoints CRUD
└── 3. Documentar OpenAPI
```

---

## 🚀 PLAN INMEDIATO: Reparación del Usuario HL

### Paso 1: Generar Hash (Claude Code)

```bash
# Terminal en VSCode
cd "C:\Users\JuanEstebanCalle\OneDrive - Collective Mining C-Suite\Documentos\Collective Mining\Marzo 2026\Nómina\Apps\Interfaz Nomina - Alpha"

# Instalar dependencia
npm install bcryptjs

# Generar hash para contraseña "Temporal@123"
node generate-bcrypt-hash.js "Temporal@123"
```

**Output esperado**:
```
✅ Hash generado exitosamente:
$2b$12$ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ1234

Longitud: 60 caracteres
```

---

### Paso 2: Reparar en BD (Claude Desktop)

**En Claude Desktop, pega esto**:

```
He diagnosticado un problema de login en el usuario HL (HERNANDEZ LARGO JUAN FELIPE).
El hash bcrypt está incompleto (11 caracteres en lugar de 60+).

Necesito que ejecutes la reparación:

1. Primero, muestra el estado actual del usuario HL con este script:

-- Estado actual
SELECT 
    COD_USUA, ABR_USUA, NOM_USUA,
    LEN(PAS_HASH) as hash_length,
    ACT_INAC, USU_TWEB, IND_BLOQ,
    FEC_EXPI
FROM GN_USUAR
WHERE RTRIM(ABR_USUA) = 'HL'

2. Luego, actualiza el hash con este nuevo valor:

DECLARE @hash_nuevo VARCHAR(100) = '$2b$12$[REEMPLAZA_CON_HASH_GENERADO]'

UPDATE GN_USUAR
SET 
    PAS_HASH = @hash_nuevo,
    INT_FALL = 0,
    FEC_ACTU_PASS = GETDATE()
WHERE RTRIM(ABR_USUA) = 'HL'

3. Finalmente, valida que el cambio fue exitoso:

SELECT 
    COD_USUA, ABR_USUA,
    LEN(PAS_HASH) as hash_length,
    CASE WHEN LEN(PAS_HASH) >= 60 THEN '✅ VÁLIDO' ELSE '❌ INVÁLIDO' END as estado,
    ACT_INAC, USU_TWEB, IND_BLOQ
FROM GN_USUAR
WHERE RTRIM(ABR_USUA) = 'HL'
```

---

### Paso 3: Validar Completo (Claude Code)

Después de que Claude Desktop ejecute los pasos, copia el resultado aquí y yo:
- Validaré que el hash es correcto
- Crearé un documento de evidencia
- Documentaré el procedimiento

---

## 🔐 Consideraciones de Seguridad

⚠️ **IMPORTANTE**:
1. **Nunca** almacenes passwords en texto plano
2. **Siempre** usa bcrypt con salt_rounds >= 12
3. **No** compartas hashes en canales inseguros
4. **Documenta** quién cambió qué y cuándo
5. **Usa** logs de auditoría en la BD

### Logs de Auditoría (Crear después de reparar)

```sql
-- Tabla para auditar cambios de password
CREATE TABLE dbo.GN_AUDIT_PASS (
    ID_AUDIT INT IDENTITY(1,1) PRIMARY KEY,
    COD_USUA INT NOT NULL,
    HASH_ANTERIOR VARCHAR(100),
    HASH_NUEVO VARCHAR(100),
    QUIEN_CAMBIO VARCHAR(8) NOT NULL,
    CUANDO DATETIME DEFAULT GETDATE(),
    RAZON VARCHAR(500),
    FOREIGN KEY (COD_USUA) REFERENCES GN_USUAR(COD_USUA)
)

-- Registrar el cambio de hoy
INSERT INTO dbo.GN_AUDIT_PASS (COD_USUA, HASH_NUEVO, QUIEN_CAMBIO, RAZON)
VALUES (4, '[HASH_NUEVO]', 'ADMIN', 'Reparación hash incompleto - diagnóstico 2026-04-13')
```

---

## 📚 Recursos

- [bcryptjs NPM](https://www.npmjs.com/package/bcryptjs)
- [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [SQL Server MCP Protocol](https://modelcontextprotocol.io/)

---

## ✅ Checklist Final

- [ ] Hash generado y validado
- [ ] Script SQL ejecutado en la BD
- [ ] Usuario HL puede hacer login
- [ ] Logs de auditoría creados
- [ ] Documentación actualizada
- [ ] MCP proxy configurado (opcional)

---

**Próximo paso**: Ejecuta el Paso 1 (generar hash) en Claude Code
