# 🔗 Integración de Autenticación en Rutas Existentes

Una vez instalado el sistema de autenticación, integra seguridad en tus rutas existentes.

---

## PASO 1: Proteger Rutas Existentes

### Actualizar `routes/nomina.js`

**ANTES:**
```javascript
const express = require('express');
const router = express.Router();
const nominaController = require('../controllers/nominaController');

// ❌ Sin protección
router.post('/ocasionales', nominaController.crearOcasional);
router.get('/ocasionales', nominaController.obtenerOcasionales);
```

**DESPUÉS:**
```javascript
const express = require('express');
const router = express.Router();
const nominaController = require('../controllers/nominaController');
const { verifyToken, checkPermission } = require('../middleware/authMiddleware');

// ✅ Con protección
router.post(
  '/ocasionales',
  verifyToken,                              // Verificar token
  checkPermission('nomina', 'create'),      // Verificar permiso
  nominaController.crearOcasional
);

router.get(
  '/ocasionales',
  verifyToken,                              // Verificar token
  checkPermission('nomina', 'view'),        // Verificar permiso
  nominaController.obtenerOcasionales
);

router.put(
  '/ocasionales/:id',
  verifyToken,
  checkPermission('nomina', 'edit'),
  nominaController.actualizarOcasional
);

router.delete(
  '/ocasionales/:id',
  verifyToken,
  checkPermission('nomina', 'delete'),
  nominaController.eliminarOcasional
);

module.exports = router;
```

### Actualizar `routes/reportes.js`

```javascript
const express = require('express');
const router = express.Router();
const reportesController = require('../controllers/reportesController');
const { verifyToken, checkPermission } = require('../middleware/authMiddleware');

// Todas las rutas requieren: autenticación + ver reportes
router.get(
  '/consolidado',
  verifyToken,
  checkPermission('reportes', 'view'),
  reportesController.obtenerReporteConsolidado
);

router.get(
  '/por-periodo',
  verifyToken,
  checkPermission('reportes', 'view'),
  reportesController.obtenerReportePeriodo
);

module.exports = router;
```

### Actualizar `routes/maestros.js`

```javascript
const express = require('express');
const router = express.Router();
const maestrosController = require('../controllers/maestrosController');
const { verifyToken, checkPermission, checkLevel } = require('../middleware/authMiddleware');

// Consultas básicas (todos pueden ver)
router.get(
  '/buscar-cedulas',
  verifyToken,
  checkPermission('maestros', 'view'),
  maestrosController.buscarCedulasConCoincidencia
);

// Editar maestros (solo admin/supervisor)
router.put(
  '/empleado/:cedula',
  verifyToken,
  checkLevel(2),                             // Mínimo nivel 2 (supervisor)
  checkPermission('maestros', 'edit'),
  maestrosController.actualizarEmpleado
);

module.exports = router;
```

---

## PASO 2: Actualizar Controladores

Los controladores ahora reciben información del usuario autenticado en `req`:

```javascript
// En authMiddleware.js se agrega:
req.usuarioId      // ID del usuario
req.cedula         // Cédula del usuario
req.nivel          // Nivel (1, 2, 3)
req.rolesUsuario   // Array de roles (si usó checkPermission)
```

### Ejemplo: Usar Info del Usuario

**ANTES:**
```javascript
exports.crearOcasional = async (req, res) => {
  const { cedula, valor } = req.body;
  // ❌ No sabemos quién hizo esta acción
};
```

**DESPUÉS:**
```javascript
exports.crearOcasional = async (req, res) => {
  const { cedula, valor } = req.body;
  const usuarioActual = req.cedula;  // ✅ Saber quién hizo la acción
  
  try {
    // Registrar quién creó la novedad
    const query = `
      INSERT INTO Ocasionales (
        CEDULA, VALOR, USUARIOREGISTRO, FECHREGISTRO
      )
      VALUES (@cedula, @valor, @usuarioActual, GETDATE());
    `;

    await executeQuery(query, {
      cedula,
      valor,
      usuarioActual  // ← Usuario autenticado
    });

    // Registrar acceso exitoso (opcional)
    console.log(`[NOMINA] ${usuarioActual} creó ocasional para ${cedula}`);

    res.json({
      status: 'success',
      message: 'Novedad ocasional creada',
      creadoPor: usuarioActual
    });

  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
};
```

---

## PASO 3: Proteger Página Frontend

### Actualizar `index_novedades.html`

Agregar antes de otros scripts:

```html
<!-- Autenticación -->
<script src="/js/auth.js"></script>

<!-- Resto de scripts -->
<script src="/js/api.js"></script>
```

En el `<body>`, agregar botón de logout:

```html
<div id="usuario-menu" style="position: absolute; top: 10px; right: 10px;">
  <span id="nombreUsuario"></span> |
  <a href="#" onclick="AuthUtil.logout(); return false;">Cerrar sesión</a>
</div>

<script>
  // Mostrar nombre del usuario actual
  document.addEventListener('DOMContentLoaded', () => {
    const usuario = AuthUtil.getUsuario();
    if (usuario) {
      document.getElementById('nombreUsuario').textContent = usuario.nombre;
    }
  });
</script>
```

---

## PASO 4: Actualizar Llamadas API en Frontend

### Cambiar llamadas fetch

**ANTES (sin autenticación):**
```javascript
async function cargarOcasionales() {
  const response = await fetch('/api/nomina/ocasionales');
  const data = await response.json();
  console.log(data);
}
```

**DESPUÉS (con autenticación automática):**
```javascript
async function cargarOcasionales() {
  try {
    const response = await AuthUtil.fetchAuth('/api/nomina/ocasionales');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(data);
  } catch (error) {
    console.error('Error:', error);
    // Si es 401, AuthUtil.fetchAuth redirige automáticamente
  }
}
```

### Ejemplo: Crear Novedad con Auth

**ANTES:**
```javascript
async function crearNovedad() {
  const cedula = document.getElementById('cedula').value;
  const valor = document.getElementById('valor').value;

  const response = await fetch('/api/nomina/ocasionales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cedula, valor })
  });

  const data = await response.json();
  // ❌ Sin manejo de errores de autenticación
}
```

**DESPUÉS:**
```javascript
async function crearNovedad() {
  const cedula = document.getElementById('cedula').value;
  const valor = document.getElementById('valor').value;

  try {
    // ✅ AuthUtil maneja todo automáticamente
    const response = await AuthUtil.fetchAuth('/api/nomina/ocasionales', {
      method: 'POST',
      body: { cedula, valor }  // Se serializa automáticamente
    });

    if (!response.ok) {
      const error = await response.json();
      mostrarAlerta('error', error.message || 'Error al crear novedad');
      return;
    }

    const data = await response.json();
    mostrarAlerta('success', 'Novedad creada exitosamente');
    
    // Refrescar tabla
    cargarOcasionales();

  } catch (error) {
    console.error('Error:', error);
    mostrarAlerta('error', error.message);
  }
}
```

---

## PASO 5: Control Condicional de UI

Mostrar/ocultar elementos según permisos:

```html
<!-- Solo Admin -->
<div id="adminPanel" style="display: none;">
  <button onclick="abrirCrearUsuario()">➕ Crear Usuario</button>
  <button onclick="abrirReporteAuditoria()">📊 Ver Auditoría</button>
</div>

<!-- Solo Supervisor o Admin -->
<div id="supervisorPanel" style="display: none;">
  <button onclick="abrirGestionEquipo()">👥 Gestión de Equipo</button>
</div>

<!-- Todos -->
<button onclick="abrirCambiarPass()">🔑 Cambiar Contraseña</button>

<script>
  document.addEventListener('DOMContentLoaded', () => {
    const usuario = AuthUtil.getUsuario();
    
    if (AuthUtil.esAdmin()) {
      document.getElementById('adminPanel').style.display = 'block';
      document.getElementById('supervisorPanel').style.display = 'block';
    } else if (AuthUtil.esSupervisor()) {
      document.getElementById('supervisorPanel').style.display = 'block';
    }
  });
</script>
```

---

## PASO 6: Manejo de Errores de Permiso

Crear función para mostrar alertas:

```javascript
async function ejecutarConPermiso(funcion, nombreAccion) {
  try {
    await funcion();
  } catch (error) {
    if (error.message.includes('403')) {
      mostrarAlerta('error', `No tienes permiso para ${nombreAccion}`);
    } else if (error.message.includes('401')) {
      mostrarAlerta('error', 'Tu sesión ha expirado. Por favor inicia sesión de nuevo.');
      AuthUtil.logout();
    } else {
      mostrarAlerta('error', error.message);
    }
  }
}

// Usar así:
async function crearNovedad() {
  await ejecutarConPermiso(
    () => AuthUtil.fetchAuth('/api/nomina/ocasionales', { /* ... */ }),
    'crear novedades'
  );
}
```

---

## PASO 7: Registrar Acciones en BD

Modificar controladores para registrar acciones:

```javascript
exports.crearOcasional = async (req, res) => {
  const usuarioId = req.usuarioId;
  const cedula = req.cedula;

  try {
    // ... crear novedad ...

    // Registrar acceso
    const logQuery = `
      INSERT INTO GN_LOG_ACCESO (
        ID_USUAR, CEDULA, TIPO_EVENTO, RECURSO, ESTADO, MENSAJE
      )
      VALUES (
        @usuarioId, @cedula, 'ACCESO_RECURSO',
        'nomina.create', 'EXITOSO', 'Creó novedad ocasional'
      )
    `;

    await executeQuery(logQuery, { usuarioId, cedula }).catch(() => {
      // Ignorar errores en logging
    });

    res.json({ status: 'success' });

  } catch (err) {
    // Registrar error
    const errorLogQuery = `
      INSERT INTO GN_LOG_ACCESO (
        ID_USUAR, CEDULA, TIPO_EVENTO, RECURSO, ESTADO, MENSAJE
      )
      VALUES (
        @usuarioId, @cedula, 'ACCESO_RECURSO',
        'nomina.create', 'ERROR', @mensaje
      )
    `;

    await executeQuery(errorLogQuery, {
      usuarioId,
      cedula,
      mensaje: err.message
    }).catch(() => {});

    res.status(500).json({ error: err.message });
  }
};
```

---

## PASO 8: Configurar Permisos por Rol

Definir qué cada rol puede hacer:

```sql
-- ADMIN: Acceso total
INSERT INTO GN_PERMISOS VALUES
  ('ADMIN', 'nomina', 'view', NULL, 1),
  ('ADMIN', 'nomina', 'create', NULL, 1),
  ('ADMIN', 'nomina', 'edit', NULL, 1),
  ('ADMIN', 'nomina', 'delete', NULL, 1),
  ('ADMIN', 'reportes', 'view', NULL, 1),
  ('ADMIN', 'maestros', 'edit', NULL, 1);

-- RRHH: Crear y editar nóminas
INSERT INTO GN_PERMISOS VALUES
  ('RRHH', 'nomina', 'view', NULL, 1),
  ('RRHH', 'nomina', 'create', NULL, 1),
  ('RRHH', 'nomina', 'edit', NULL, 1),
  ('RRHH', 'reportes', 'view', NULL, 1);

-- SUPERVISOR: Solo ver
INSERT INTO GN_PERMISOS VALUES
  ('SUPERVISOR', 'nomina', 'view', NULL, 1),
  ('SUPERVISOR', 'reportes', 'view', NULL, 1);

-- EMPLEADO: Solo ver su nómina
INSERT INTO GN_PERMISOS VALUES
  ('EMPLEADO', 'nomina', 'view', NULL, 1);
```

---

## EJEMPLO COMPLETO: Ruta Protegida

```javascript
// En routes/nomina.js
const express = require('express');
const router = express.Router();
const nominaController = require('../controllers/nominaController');
const { verifyToken, checkPermission, checkLevel } = require('../middleware/authMiddleware');

// ✅ Obtener ocasionales (todos los roles con permiso)
router.get(
  '/ocasionales',
  verifyToken,
  checkPermission('nomina', 'view'),
  nominaController.obtenerOcasionales
);

// ✅ Crear ocasional (solo roles con permiso)
router.post(
  '/ocasionales',
  verifyToken,
  checkPermission('nomina', 'create'),
  nominaController.crearOcasional
);

// ✅ Editar ocasional (solo roles con permiso)
router.put(
  '/ocasionales/:id',
  verifyToken,
  checkPermission('nomina', 'edit'),
  nominaController.actualizarOcasional
);

// ✅ Eliminar ocasional (solo admin/nivel 3)
router.delete(
  '/ocasionales/:id',
  verifyToken,
  checkLevel(3),  // Solo nivel 3 (admin)
  nominaController.eliminarOcasional
);

// ✅ Reportes avanzados (solo supervisor+)
router.get(
  '/reportes/auditoria',
  verifyToken,
  checkLevel(2),  // Mínimo nivel 2
  nominaController.obtenerAuditoria
);

module.exports = router;
```

---

## EJEMPLO: Frontend Integrado

```html
<!DOCTYPE html>
<html>
<head>
    <title>Nómina</title>
</head>
<body>
    <div class="header">
        <h1>Sistema de Nómina</h1>
        <div class="user-menu">
            <span id="userName"></span> | 
            <a href="#" onclick="logout()">Logout</a>
        </div>
    </div>

    <div id="adminPanel" class="hidden">
        <button onclick="crearUsuario()">➕ Crear Usuario</button>
    </div>

    <div id="nominaPanel">
        <button onclick="crearOcasional()">Crear Ocasional</button>
        <table id="ocasionalesTable">
            <thead>
                <tr>
                    <th>Cédula</th>
                    <th>Valor</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody id="ocasionalesBody">
            </tbody>
        </table>
    </div>

    <script src="/js/auth.js"></script>
    <script>
        // Proteger página
        AuthUtil.protegerPagina();

        // Mostrar datos del usuario
        document.addEventListener('DOMContentLoaded', () => {
            const usuario = AuthUtil.getUsuario();
            document.getElementById('userName').textContent = usuario.nombre;

            if (AuthUtil.esAdmin()) {
                document.getElementById('adminPanel').classList.remove('hidden');
            }

            cargarOcasionales();
        });

        // Cargar ocasionales
        async function cargarOcasionales() {
            try {
                const response = await AuthUtil.fetchAuth('/api/nomina/ocasionales');
                const data = await response.json();

                const tbody = document.getElementById('ocasionalesBody');
                tbody.innerHTML = data.ocasionales.map(o => `
                    <tr>
                        <td>${o.cedula}</td>
                        <td>${o.valor}</td>
                        <td>
                            <button onclick="editarOcasional('${o.id}')">Edit</button>
                            <button onclick="eliminarOcasional('${o.id}')">Delete</button>
                        </td>
                    </tr>
                `).join('');

            } catch (error) {
                console.error('Error:', error);
            }
        }

        // Crear ocasional
        async function crearOcasional() {
            const cedula = prompt('Cédula:');
            const valor = prompt('Valor:');

            try {
                const response = await AuthUtil.fetchAuth('/api/nomina/ocasionales', {
                    method: 'POST',
                    body: { cedula, valor }
                });

                if (response.ok) {
                    alert('Ocasional creada');
                    cargarOcasionales();
                } else {
                    const error = await response.json();
                    alert('Error: ' + error.message);
                }
            } catch (error) {
                alert('Error: ' + error.message);
            }
        }

        // Logout
        function logout() {
            if (confirm('¿Estás seguro?')) {
                AuthUtil.logout();
            }
        }
    </script>
</body>
</html>
```

---

## Checklist de Integración

- [ ] Actualizar rutas con `verifyToken`
- [ ] Agregar `checkPermission` donde corresponda
- [ ] Incluir `/js/auth.js` en HTML
- [ ] Cambiar llamadas `fetch` a `AuthUtil.fetchAuth()`
- [ ] Mostrar nombre de usuario en UI
- [ ] Agregar botón de logout
- [ ] Controlar visibilidad de elementos por rol
- [ ] Registrar acciones en GN_LOG_ACCESO
- [ ] Probar con usuarios diferentes
- [ ] Verificar permisos se respetan
- [ ] Verificar tokens en localStorage
- [ ] Verificar logs en GN_LOG_ACCESO

---

## Próximo Paso

Una vez integrada la autenticación en todas las rutas:

1. **Prueba exhaustiva** con diferentes usuarios
2. **Revisa los logs** en GN_LOG_ACCESO
3. **Configura más roles** si necesitas
4. **Documenta** los permisos en cada endpoint
5. **Agrega 2FA** (opcional, con SMS/Email)

¡Felicidades! 🎉 El sistema está completamente integrado y funcionando.
