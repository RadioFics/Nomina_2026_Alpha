# Mensaje Informativo — Sistema de Gestión de Nómina
## Nomina_2026_Alpha | Puntos Clave para el Equipo de Desarrollo

**Para:** Equipo de Desarrollo e Infraestructura  
**De:** Juan Esteban Calle Palmett  
**Fecha:** 13 de mayo de 2026

---

## ¿Qué es el sistema?

Es una **plataforma web centralizada de gestión de novedades de nómina**, diseñada para reemplazar el manejo manual de hojas de cálculo. Permite registrar, consultar y controlar novedades (ocasionales, fijas, ausencias y cambios) de forma centralizada, con historial completo de auditoría.

El sistema ya está desarrollado en la fase **Alpha** y necesita ser ubicado en un servidor accesible a través de la línea privada de la organización para su uso en producción.

---

## Tecnología utilizada

- **Backend:** Node.js + Express.js (JavaScript)
- **Base de datos:** Microsoft SQL Server — instancia `MineDax`
- **Frontend:** HTML5 / CSS3 / JavaScript (sin frameworks de compilación)
- **Autenticación:** JWT (tokens firmados) + bcrypt (contraseñas)
- **Exportación Excel:** Python 3 (módulo ADECCO)
- **Puerto del servidor:** 3000, escucha en `0.0.0.0` (acceso desde toda la red)

---

## Los 5 requisitos sin excepción

### 1. Node.js v18+ instalado en el servidor
**Por qué:** es el motor de ejecución del sistema. Sin Node.js el servidor no arranca. Debe estar en el PATH del sistema operativo.

### 2. Python 3.9+ instalado con opción "Add to PATH"
**Por qué:** el módulo de exportación ADECCO genera archivos Excel mediante un script Python. Sin Python instalado y en el PATH, esta función falla con error 9009 y bloquea la exportación.

### 3. ODBC Driver 17 for SQL Server instalado
**Por qué:** es el conector que permite a Node.js (`mssql`) hablar con SQL Server. Sin este driver la conexión a la base de datos es imposible y el sistema no funciona en absoluto.

### 4. Archivo `.env` correctamente configurado
**Por qué:** el sistema lee toda su configuración desde este archivo (servidor SQL, usuario, contraseña, clave JWT, puerto). Sin él, el servidor no puede conectarse a la BD ni emitir tokens de sesión. Las variables críticas son: `SERVER`, `DATABASE`, `UID`, `PWD`, `JWT_SECRET`, `PORT`.

### 5. Scripts SQL de migración ejecutados en MineDax
**Por qué:** el sistema requiere tablas propias (`NO_NOVED`, `NO_NOVED_Auditoria`) además de las tablas heredadas de MineDax. Sin la migración, el 100% de las operaciones de registro de novedades falla con error SQL 208 ("objeto no válido").

---

## Flujo de trabajo (cómo opera el sistema)

```
Empleado/Analista (navegador) → http://IP_SERVIDOR:3000
        ↓
  [Login con JWT]
        ↓
  Módulos protegidos:
  Ocasionales / Fijas / Ausencias / Cambios / Reportes
        ↓
  API REST (Express, Node.js)
        ↓
  SQL Server — Base de datos MineDax
  (NO_NOVED: registro centralizado + tablas específicas + auditoría)

----- PARALELO (sin login) -----
Empleado remoto (navegador) → http://IP_SERVIDOR:3000/solicitud/permiso
                                http://IP_SERVIDOR:3000/solicitud/vacaciones
        ↓
  API pública /api/solicitudes
        ↓
  SQL Server (registro en BD directamente)
```

**Por qué necesita funcionar a distancia:** la organización tiene personal en múltiples sedes. Los formularios de autoservicio (permiso, vacaciones) deben ser accesibles sin credenciales desde cualquier equipo de la red corporativa, guardando la información en la base de datos central de forma inmediata y continua.

---

## Tipos de usuario del sistema

| Rol | Quién lo usa | Qué puede hacer |
|---|---|---|
| **Administrador** | Coordinador / Líder de nómina | Todo: configurar BD, cerrar períodos, gestionar usuarios, exportar ADECCO |
| **Analista de nómina** | Personal de nómina | Registrar y editar novedades, consultar históricos, descargar reportes |
| **Empleado (sin cuenta)** | Cualquier empleado | Solo los formularios públicos (permiso / vacaciones), sin contraseña |

---

## Qué debe hacer el equipo de infraestructura

1. **Elegir el servidor** donde se alojará la plataforma (IP fija en la red corporativa).
2. **Instalar:** Node.js v18+, Python 3.9+, ODBC Driver 17, y opcionalmente PM2.
3. **Configurar el `.env`** con los datos del servidor SQL Server de producción.
4. **Ejecutar** `npm install` y los 3 scripts SQL de migración.
5. **Abrir el puerto 3000** en el firewall de Windows del servidor.
6. **Verificar acceso** desde un navegador de la red: `http://IP_SERVIDOR:3000`.
7. **Configurar PM2** para que el servidor reinicie automáticamente si cae.
8. **HTTPS (recomendado):** configurar un proxy inverso con certificado SSL para producción.

---

## Problemas a resolver antes del despliegue

| # | Problema | Solución |
|---|---|---|
| 1 | Python no en PATH → falla exportación ADECCO | Instalar Python 3 marcando "Add to PATH" + reiniciar equipo |
| 2 | `nominaController.js` legacy referencia tablas inexistentes → error SQL 208 | Reemplazar con agregador que delegue a los controladores correctos |

---

*Este mensaje se complementará con capturas de pantalla del sistema en una comunicación posterior.*

*Nomina_2026_Alpha — Confidencial — Mayo 2026*
