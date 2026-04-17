# ⚡ Quick Reference - Comandos para Copiar-Pegar

## 🎯 En 30 segundos

```
❌ Problema: Usuario HL no puede loguear
✅ Causa: Hash bcrypt incompleto
⏱️  Tiempo: 30 minutos
```

---

## 1️⃣ CLAUDE CODE (VSCode Terminal)

### Instalar herramienta
```bash
npm install bcryptjs
```

### Generar hash
```bash
node generate-bcrypt-hash.js "Temporal@123"
```

**Copiar el hash que sale** (como `$2b$12$...`)

---

## 2️⃣ CLAUDE DESKTOP (Envía este prompt)

```
Repara el usuario HL. Hash nuevo: [PEGA_HASH_AQUI]

Ejecuta en orden:

1. VERIFICAR:
SELECT COD_USUA, ABR_USUA, NOM_USUA, LEN(PAS_HASH) as hash_len, 
       ACT_INAC, USU_TWEB, IND_BLOQ, FEC_EXPI
FROM GN_USUAR WHERE RTRIM(ABR_USUA) = 'HL'

2. ACTUALIZAR:
UPDATE GN_USUAR
SET PAS_HASH = '[PEGA_HASH]', INT_FALL = 0, CAM_PASS = NULL
WHERE RTRIM(ABR_USUA) = 'HL'

3. VALIDAR:
SELECT ABR_USUA, 
       CASE WHEN LEN(PAS_HASH) >= 60 THEN '✅ OK' ELSE '❌ FAIL' END,
       ACT_INAC, USU_TWEB, IND_BLOQ,
       CASE WHEN ACT_INAC='A' AND USU_TWEB='S' AND IND_BLOQ='N' 
            AND LEN(PAS_HASH)>=60 AND (FEC_EXPI IS NULL OR FEC_EXPI>=GETDATE())
            THEN '✅ PUEDE LOGUEAR' ELSE '❌ NO PUEDE' END
FROM GN_USUAR WHERE RTRIM(ABR_USUA) = 'HL'
```

---

## 3️⃣ VALIDAR TODOS LOS USUARIOS (Después de reparar)

```sql
-- Pega en Claude Desktop o SSMS
-- Archivo: VALIDACION_COMPLETA_TODOS_USUARIOS.sql
```

---

## 📋 Checklist Final

```
✅ Hash generado con Node.js
✅ Script ejecutado en BD
✅ Usuario HL verifica con:
   - ACT_INAC = 'A' (activo)
   - USU_TWEB = 'S' (web enabled)
   - IND_BLOQ = 'N' (not locked)
   - PAS_HASH >= 60 chars (valid bcrypt)
   - FEC_EXPI >= TODAY (not expired)
✅ Resultado: "✅ PUEDE LOGUEAR"
```

---

## 🚨 Si algo falla

### Error: npm no encontrado
```bash
# Instala Node.js desde nodejs.org
# O usa: 
npm install -g bcryptjs
```

### Error: Hash inválido
```bash
# Verifica que output tiene ~60 caracteres
# y comienza con $2b$12$ o similar
node generate-bcrypt-hash.js "OtraContraseña@123"
```

### Error: Usuario no encontrado
```bash
# Verifica que el login sea exactamente 'HL'
SELECT * FROM GN_USUAR WHERE ABR_USUA LIKE '%HL%'
```

---

## 📞 Próximos pasos

1. Ejecuta los comandos de Claude Code
2. Copia el hash
3. Pega el prompt en Claude Desktop
4. Espera confirmación: "✅ PUEDE LOGUEAR"
5. ¡Listo!

---

**Tiempo total**: ~30 min  
**Complejidad**: 🟢 Baja  
**Riesgo**: 🟢 Bajo (reversible)

