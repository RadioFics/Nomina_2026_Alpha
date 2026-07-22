# Análisis de Estados y Criterios de Importación Masiva
**Sistema:** Nómina 2026 Alpha — Collective Mining / Adecco  
**Fecha:** Junio 2026  
**Alcance:** `importarExcelController.js`, `buscarNovedadExistente`, estados `ACT_ESTA` y tabla `NO_NOVED`

---

## 1. Estados del Registro (`ACT_ESTA`)

Cada fila en `NO_NOVED` (cabecera) y en su sub-tabla (`NO_OCASI`, `NO_FIJAS`, `NO_AUSEN`, `NO_CAMBI`) tiene un campo `ACT_ESTA` con tres valores posibles. La decisión del motor de importación se basa **en el par** cabecera + sub-tabla.

| Estado | Valor | Descripción funcional | Quién lo asigna |
|--------|-------|----------------------|-----------------|
| **Activo** | `'A'` | Novedad vigente, visible en tablas y gráficos del período activo | `INSERT` inicial, o `REACTIVADO` por re-importación |
| **Inactivo** | `'I'` | Novedad archivada cuando su período se cierra (o inhabilitada manualmente con el nuevo modal) | `verificarYCerrarPeriodosVencidos()` automáticamente; usuario con botón **Inhabilitar** |
| **Eliminado** | `'E'` | Novedad marcada como exenta/eliminada; excluida de trazabilidad | Usuario con botón **Eliminar**; `INSERT` inicial en `anularOcasional*` |

### Transiciones de estado

```
           cierre de período
  INSERT → 'A' ──────────────────→ 'I'
                                    │
           re-importación del        │ (re-importación en período
           mismo período             │  ya cerrado → REACTIVADO)
               ↑────────────────────┘
               
  Usuario  → 'A' → Inhabilitar → 'I'   (reversible)
           → 'A' → Eliminar    → 'E'   (permanente desde la UI)
           → 'I' → Eliminar    → 'E'   (también posible)
```

**Nota crítica:** El campo `ACT_ESTA` está **duplicado** en `NO_NOVED` y en cada sub-tabla. Ambos deben coincidir. El motor de importación siempre actualiza los dos simultáneamente dentro de una transacción.

---

## 2. Estados de Resultado en la Importación

La función `procesarEnBD()` en `importarExcelController.js` determina el resultado de cada fila importada buscando primero si existe un registro con la misma **clave de negocio**.

### Clave de deduplicación

```
(COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD)
```

- **COD_FUNCI**: funcionario resuelto por cédula → `GN_FUNCI JOIN GN_TERCE ON NUM_IDEN`
- **COD_CONC**: concepto de nómina (columna "Novedad" mapeada por nombre)
- **COD_PERIOD**: período **activo al momento de la importación** (no derivado del archivo)

> ⚠️ El período se resuelve siempre al período en curso (`PER_EST='A'`, fecha actual entre `PER_FINI` y `PER_FFIN`), independientemente de las fechas en el archivo. Importar en la quincena correcta es responsabilidad del operador.

### Tabla de estados de importación

| Estado | `ES_ACTIVA` | `ES_EXENTA` | Acción ejecutada | Resultado en BD |
|--------|-------------|-------------|-----------------|-----------------|
| **INSERTADO** | — (no existe) | — | INSERT en `NO_NOVED` + sub-tabla con `ACT_ESTA='A'` | Fila nueva, período activo |
| **INSERTADO** | `0` | `1` | Igual al anterior (el `'E'` se ignora) | Fila **nueva** paralela al registro eliminado |
| **ACUMULADO** | `1` | `0` | UPDATE en sub-tabla: acumula cantidad/valor sobre el registro activo | No hay nueva fila; el valor se suma |
| **REACTIVADO** | `0` | `0` | UPDATE en `NO_NOVED` + sub-tabla: `ACT_ESTA='A'` + nuevos valores del archivo | El registro inactivo resucita con datos frescos |
| **OMITIDO** | — | — | Ninguna | Empleado sin conceptos válidos en el archivo |
| **ERROR** | — | — | ROLLBACK | Cédula no encontrada en `GN_FUNCI` / `GN_TERCE`, o error de BD |

---

## 3. Árbol de Decisión del Motor de Importación

```
Para cada (cédula, concepto) del archivo:
│
├─ ¿Existe COD_FUNCI para la cédula?
│    └─ No → ERROR ("Cédula no encontrada")
│
├─ buscarNovedadExistente(codFunci, codConc, codPeriod)
│    Prioridad de búsqueda: A → I → E (ORDER BY CASE)
│
├─ existente == null  →  INSERTADO (nueva fila)
│
├─ existente.ES_ACTIVA == true  →  ACUMULADO
│    • Ocasional: suma CANTIDAD (y VALOR si el parser lo envía)
│    • Fija: suma VALOR
│    • Ausentismo: suma DIAS_TOTAL (y actualiza fechas/diagnóstico)
│    • Cambio: reemplaza VALOR_NUEVO y FEC_INI
│
├─ existente.ES_ACTIVA == false && existente.ES_EXENTA == false  →  REACTIVADO
│    • Aplica cuando ACT_ESTA='I' (período cerrado o inhabilitado manualmente)
│    • Reescribe valores con los del archivo; no acumula
│
└─ existente.ES_EXENTA == true  →  INSERTADO (fila nueva)
     • El registro 'E' queda huérfano (no se toca)
     • Riesgo: acumulación de ghost records 'E'
```

---

## 4. Eficiencia Real por Escenario

### Escenario A — Importación normal (período abierto, primer import)

| Condición | Resultado esperado | Resultado real |
|-----------|-------------------|----------------|
| Cédula válida, concepto nuevo para el período | INSERTADO | ✅ Correcto |
| Cédula inválida o retirado | ERROR | ✅ Correcto, fila saltada |
| Empleado en archivo sin concepto mapeado | OMITIDO | ✅ Correcto |

**Eficiencia:** 100% de filas procesables se insertan correctamente.

---

### Escenario B — Re-importación del mismo archivo (mismo período abierto)

| Condición | Resultado esperado | Resultado real |
|-----------|-------------------|----------------|
| Re-import del mismo archivo sin cambios | Acumular sobre registro existente | ⚠️ **ACUMULADO** — el valor se **suma** al existente, duplicando efectivamente el monto |
| Re-import con corrección de un valor | Corregir el valor | ⚠️ **ACUMULADO** — el valor corregido se suma al anterior (no reemplaza) |

**Eficiencia:** ❌ La re-importación sin anular el registro previo **duplica valores**. No existe un flag de "reemplazar" vs "acumular"; la única salida es inhabilitar el registro existente antes de re-importar.

> **Impacto práctico:** Si Adecco envía una corrección al archivo del mismo período, el operador debe:
> 1. Inhabilitar el registro incorrecto con el nuevo modal.
> 2. Re-importar el archivo corregido → genera INSERTADO con el valor correcto.
>
> Si omite el paso 1, ambas cantidades quedarán activas.

---

### Escenario C — Importación después de cerrar el período

| Condición | Resultado | Comentario |
|-----------|-----------|-----------|
| El período fue cerrado (`PER_EST='I'`) | No hay período activo → fallo total | El endpoint devuelve error antes de procesar cualquier fila |
| El período fue cerrado pero hay otro abierto | Se asigna al período **nuevo abierto** | ⚠️ El operador puede asignar novedades de quincena anterior al período equivocado |

---

### Escenario D — Registro inhabilitado, re-importación posterior

| Condición | Resultado |
|-----------|-----------|
| Registro `'I'` + mismo período aún abierto | **REACTIVADO**: el registro vuelve a `'A'` con los nuevos valores del archivo |
| Registro `'I'` + período ya cerrado | El período es distinto; se crea INSERTADO en el período activo actual |

**Eficiencia:** ✅ Correcto para el caso de uso intencional (anular y re-importar con corrección). El REACTIVADO no acumula — reemplaza — lo cual es el comportamiento deseado.

---

### Escenario E — Registro eliminado (`'E'`), re-importación

| Condición | Resultado |
|-----------|-----------|
| Registro `'E'` en mismo período activo | **INSERTADO**: nueva fila paralela. El `'E'` queda huérfano. |
| Múltiples ciclos eliminar + re-importar | Acumulación de filas `'E'` (ghost records) |

**Eficiencia:** ⚠️ Funcional pero deja basura acumulada. Existe `limpiarDuplicadosInactivos` para `'I'` pero **no** para `'E'`.

---

## 5. Problemas Identificados

### 5.1 Acumulación por re-importación (crítico para correcciones)

La operación ACUMULADO es **aditiva**, no reemplazante. Esto es correcto para importaciones parciales (Adecco envía por lotes), pero problemático cuando el operador re-importa para corregir. No hay distinción en el sistema entre "quiero agregar más" y "quiero corregir el total".

**Solución sugerida:** Agregar al endpoint de importación un parámetro `?modo=acumular|reemplazar`. En modo `reemplazar`, cuando `ES_ACTIVA=true`, hacer UPDATE directo del valor en lugar de suma.

---

### 5.2 Ghost records `'E'`

Cada vez que un registro se elimina y luego se re-importa, se crea una fila `'E'` huérfana. Con el tiempo, la tabla `NO_NOVED` acumula estas filas sin ningún beneficio: no aparecen en trazabilidad, no sirven para auditoría (la trazabilidad sirve para eso), y ralentizan los `buscarNovedadExistente` (que deben ordenar por prioridad A→I→E).

**Solución sugerida:** Extender `limpiarDuplicadosInactivos` para incluir registros `'E'`, o ejecutar un script de limpieza periódico para eliminar físicamente los `'E'` más antiguos de períodos cerrados.

---

### 5.3 Sin unicidad forzada en BD

La clave `(COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD)` **no tiene un índice UNIQUE** en la base de datos. La deduplicación solo existe a nivel de aplicación (`buscarNovedadExistente`). Si dos importaciones corren en paralelo (race condition), ambas pueden pasar el `buscarNovedad` con resultado nulo y ambas insertan, generando un duplicado real en estado `'A'`.

**Riesgo actual:** Bajo (el sistema es single-user en producción), pero existe.

**Solución sugerida:** Agregar un índice `UNIQUE FILTERED` en `NO_NOVED`:
```sql
CREATE UNIQUE INDEX UX_NO_NOVED_ACTIVA
ON dbo.NO_NOVED (COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD)
WHERE ACT_ESTA = 'A';
```
Esto garantiza unicidad de registros activos a nivel de base de datos, independientemente del código de aplicación.

---

### 5.4 Cédulas no mapeadas a funcionarios activos

El lookup `GN_FUNCI JOIN GN_TERCE WHERE ACT_ESTA='A'` excluye funcionarios con `ACT_ESTA='I'` (retirados). Si Adecco envía una novedad para un empleado recién retirado, la fila produce ERROR y se omite silenciosamente.

**Riesgo:** Novedades legítimas (ej. liquidación final) de empleados recién salidos se pierden sin alerta clara.

**Solución sugerida:** El ERROR ya se registra en `resumen.errores`. Mejorar la visibilidad de este error en la UI (resaltarlo en color diferente al de error de BD).

---

### 5.5 Período resuelto por fecha del servidor, no por el archivo

El período se asigna al período activo al momento de la importación. Un archivo de la primera quincena de mayo importado en junio se asignará al período de junio.

**Riesgo actual:** Manejado por el retrofix de sesiones anteriores (migración manual). Para el futuro, si el archivo tiene una columna de período explícita, el parser podría extraerla.

---

## 6. Tabla Resumen de Necesidad Práctica

| Comportamiento | Necesidad real | ¿Cubierto? |
|----------------|----------------|-----------|
| No duplicar novedades activas del mismo período | Alta — evita pagos dobles | ✅ ACUMULADO |
| Corregir una novedad sin duplicar | Alta — operación frecuente | ⚠️ Solo si se inhabilita antes |
| Reutilizar registros inactivos (re-import) | Media — ahorra INSERT + mantiene linaje | ✅ REACTIVADO |
| Ignorar registros eliminados en deduplicación | Alta — eliminar = decisión definitiva | ✅ INSERTADO sobre 'E' |
| Limpiar duplicados inactivos acumulados | Media — mantenimiento periódico | ✅ `limpiarDuplicadosInactivos` (solo OCASIONAL, solo 'I') |
| Limpiar ghost records 'E' | Baja-media | ❌ No implementado |
| Unicidad garantizada en BD | Alta | ❌ Solo a nivel de app |
| Alerta visible por novedades de empleados retirados | Media | ⚠️ Parcial (en errores del resumen) |

---

## 7. Recomendaciones Priorizadas

**Inmediatas (bajo esfuerzo):**

1. Agregar modo `reemplazar` al endpoint de importación (`?modo=reemplazar`) para cuando el operador sabe que está corrigiendo, no acumulando.
2. Extender `limpiarDuplicadosInactivos` para también limpiar registros `'E'` en períodos cerrados.

**Corto plazo:**

3. Agregar índice `UNIQUE FILTERED` en `NO_NOVED` sobre registros `'A'` para garantizar unicidad a nivel de BD.
4. Mejorar la presentación de ERRORs por "cédula no encontrada" en el resumen de importación de la UI (actualmente se mezclan con errores de BD).

**Largo plazo:**

5. Permitir que el parser Adecco extraiga el período del nombre del archivo (`FORMATO_NOVEDADES_CM_1Q_MAYO_2026.xlsx`) y lo valide contra los períodos disponibles, alertando si no coincide con el período activo.
