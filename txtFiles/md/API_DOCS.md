# Documentación de API REST

## URL Base
```
http://localhost:3000/api
```

---

## 1. OCASIONALES

### Crear Ocasional
```
POST /nomina/ocasionales
Content-Type: application/json

{
  "cedula": "1234567890",
  "nombre": "Juan Pérez",
  "novedad": "Pago por proyecto",
  "tipo": "Hora Extra",
  "cantidad": 10,
  "valor": 25000,
  "observaciones": "Trabajo proyecto ABC",
  "periodo": "2026-04-01 / 2026-04-15"
}
```

**Respuesta exitosa (201):**
```json
{
  "success": true,
  "id": "uuid-generado",
  "message": "Ocasional registrado correctamente"
}
```

---

### Obtener Ocasionales

#### Todos los ocasionales
```
GET /nomina/ocasionales
```

#### Filtrar por período
```
GET /nomina/ocasionales?periodo=2026-04-01 / 2026-04-15
```

**Respuesta:**
```json
[
  {
    "id": "uuid",
    "cedula": "1234567890",
    "nombre": "Juan Pérez",
    "novedad": "Pago por proyecto",
    "tipo": "Hora Extra",
    "cantidad": 10,
    "valor": 25000,
    "observaciones": "...",
    "periodo": "2026-04-01 / 2026-04-15",
    "fechaRegistro": "2026-04-09T14:30:00.000Z"
  }
]
```

---

### Actualizar Ocasional
```
PUT /nomina/ocasionales/:id
Content-Type: application/json

{
  "cedula": "1234567890",
  "nombre": "Juan Pérez (actualizado)",
  "novedad": "Pago por proyecto",
  "tipo": "Hora Extra",
  "cantidad": 12,
  "valor": 30000,
  "observaciones": "Trabajo actualizado"
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Ocasional actualizado"
}
```

---

### Eliminar Ocasional
```
DELETE /nomina/ocasionales/:id
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Ocasional eliminado"
}
```

---

## 2. FIJAS (Deducciones Fijas)

### Crear Fija
```
POST /nomina/fijas
Content-Type: application/json

{
  "cedula": "1234567890",
  "nombre": "Juan Pérez",
  "novedad": "Crédito Educativo",
  "tipo": "Deducción",
  "aplicacion": "Mensual",
  "valor": 150000,
  "finicial": "2026-04-01",
  "ffinal": "2026-12-31",
  "cuotas": 9,
  "cuenta": "123456789",
  "observaciones": "Educación superior",
  "periodo": "2026-04"
}
```

**Respuesta:**
```json
{
  "success": true,
  "id": "uuid",
  "message": "Deducción fija registrada"
}
```

---

### Obtener Fijas

#### Todas las fijas
```
GET /nomina/fijas
```

#### Filtrar por período
```
GET /nomina/fijas?periodo=2026-04
```

**Respuesta:**
```json
[
  {
    "id": "uuid",
    "cedula": "1234567890",
    "nombre": "Juan Pérez",
    "novedad": "Crédito Educativo",
    "tipo": "Deducción",
    "aplicacion": "Mensual",
    "valor": 150000,
    "finicial": "2026-04-01",
    "ffinal": "2026-12-31",
    "cuotas": 9,
    "cuenta": "123456789",
    "periodo": "2026-04",
    "fechaRegistro": "2026-04-09T14:30:00.000Z"
  }
]
```

---

## 3. AUSENCIAS

### Crear Ausencia
```
POST /nomina/ausencias
Content-Type: application/json

{
  "cedula": "1234567890",
  "nombre": "Juan Pérez",
  "tipo": "Licencia por Enfermedad",
  "diagnostico": "J06.9",
  "finicial": "2026-04-10",
  "ffinal": "2026-04-12",
  "dias": 3,
  "prorroga": null,
  "observaciones": "Resfriado - requiere incapacidad médica",
  "periodo": "2026-04"
}
```

**Respuesta:**
```json
{
  "success": true,
  "id": "uuid",
  "message": "Ausencia registrada"
}
```

---

### Obtener Ausencias

#### Todas las ausencias
```
GET /nomina/ausencias
```

#### Filtrar por período
```
GET /nomina/ausencias?periodo=2026-04
```

**Respuesta:**
```json
[
  {
    "id": "uuid",
    "cedula": "1234567890",
    "nombre": "Juan Pérez",
    "tipo": "Licencia por Enfermedad",
    "diagnostico": "J06.9",
    "finicial": "2026-04-10",
    "ffinal": "2026-04-12",
    "dias": 3,
    "prorroga": null,
    "observaciones": "...",
    "periodo": "2026-04",
    "fechaRegistro": "2026-04-09T14:30:00.000Z"
  }
]
```

---

## 4. ACTIVIDAD (LOG)

### Obtener Actividad Reciente
```
GET /nomina/actividad
```

Retorna los últimos 100 registros de todas las tablas (Ocasionales, Fijas, Ausencias) ordenados por fecha descendente.

**Respuesta:**
```json
[
  {
    "modulo": "Ocasionales",
    "nombre": "Juan Pérez",
    "tipo": "Pago por proyecto",
    "fechaRegistro": "2026-04-09T14:30:00.000Z",
    "estado": "Registrado"
  },
  {
    "modulo": "Ausencias",
    "nombre": "María González",
    "tipo": "Licencia por Enfermedad",
    "fechaRegistro": "2026-04-08T10:15:00.000Z",
    "estado": "Registrado"
  }
]
```

---

## 5. PRUEBA DE SERVIDOR

### Health Check
```
GET /health
```

**Respuesta:**
```json
{
  "status": "OK",
  "message": "Servidor de nómina funcionando"
}
```

---

## Códigos de Respuesta HTTP

| Código | Significado |
|--------|-------------|
| 200    | OK - Operación exitosa |
| 201    | Created - Recurso creado |
| 400    | Bad Request - Datos inválidos |
| 404    | Not Found - Recurso no encontrado |
| 500    | Server Error - Error interno |

---

## Manejo de Errores

Todas las respuestas de error siguen este formato:

```json
{
  "error": "Descripción del error",
  "details": "Detalles técnicos (si aplica)"
}
```

**Ejemplo:**
```json
{
  "error": "Error al registrar ocasional",
  "details": "Invalid column name 'cedula'"
}
```

---

## Ejemplos con cURL

### Crear Ocasional
```bash
curl -X POST http://localhost:3000/api/nomina/ocasionales \
  -H "Content-Type: application/json" \
  -d '{
    "cedula": "1234567890",
    "nombre": "Juan Pérez",
    "novedad": "Pago por proyecto",
    "tipo": "Hora Extra",
    "cantidad": 10,
    "valor": 25000,
    "observaciones": "Trabajo proyecto ABC",
    "periodo": "2026-04-01 / 2026-04-15"
  }'
```

### Obtener Ocasionales
```bash
curl http://localhost:3000/api/nomina/ocasionales
```

### Filtrar por Período
```bash
curl "http://localhost:3000/api/nomina/ocasionales?periodo=2026-04-01%20/%202026-04-15"
```

### Eliminar Ocasional
```bash
curl -X DELETE http://localhost:3000/api/nomina/ocasionales/uuid-aqui
```

---

## Ejemplos con JavaScript (Fetch)

### Crear Ocasional
```javascript
const data = {
  cedula: "1234567890",
  nombre: "Juan Pérez",
  novedad: "Pago por proyecto",
  tipo: "Hora Extra",
  cantidad: 10,
  valor: 25000,
  observaciones: "Trabajo proyecto ABC",
  periodo: "2026-04-01 / 2026-04-15"
};

fetch('http://localhost:3000/api/nomina/ocasionales', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
})
.then(response => response.json())
.then(result => console.log(result))
.catch(error => console.error('Error:', error));
```

---

## Validaciones Requeridas

### Campo: cedula
- **Tipo:** String
- **Requerido:** Sí
- **Longitud máxima:** 20 caracteres
- **Ejemplo:** "1234567890"

### Campo: nombre
- **Tipo:** String
- **Requerido:** Sí
- **Longitud máxima:** 255 caracteres
- **Ejemplo:** "Juan Pérez Rodríguez"

### Campo: valor
- **Tipo:** Decimal
- **Requerido:** Sí (para algunas operaciones)
- **Rango:** 0 - 999,999.99
- **Ejemplo:** 150000.50

### Campo: fecha (finicial, ffinal, prorroga)
- **Tipo:** Date (YYYY-MM-DD)
- **Formato:** ISO 8601
- **Ejemplo:** "2026-04-10"

---

## Rate Limiting

No hay rate limiting configurado actualmente. Para producción, se recomienda implementar:
- Límite de 100 solicitudes por minuto por IP
- Token-based authentication
- JWT para sesiones

---

## Seguridad en Producción

- [ ] Usar HTTPS/TLS
- [ ] Autenticación con JWT o sesiones
- [ ] Validación de entrada en servidor
- [ ] Sanitizar inputs SQL
- [ ] CORS restringido a dominios específicos
- [ ] Variables de entorno seguras
- [ ] Logs de auditoría
- [ ] Backup automático de BD

---

**Última actualización:** 2026-04-09
