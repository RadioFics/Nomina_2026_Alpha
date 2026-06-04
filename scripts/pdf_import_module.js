/**
 * MÓDULO DE IMPORTACIÓN PDF - MineDax
 * Se integra con el sistema existente de importación Excel
 * Sin afectar funcionalidades actuales
 */

class PDFImportModule {
  constructor() {
    this.fileInput = document.getElementById('fileInput');
    this.uploadZone = document.querySelector('.upload-zone');
    this.processedFiles = [];
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Drag & Drop
    if (this.uploadZone) {
      this.uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        this.uploadZone.style.backgroundColor = 'rgba(32,167,201,0.12)';
        this.uploadZone.style.borderColor = 'var(--cm-blue)';
      });

      this.uploadZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        this.uploadZone.style.backgroundColor = 'rgba(32,167,201,0.03)';
        this.uploadZone.style.borderColor = 'rgba(32,167,201,0.3)';
      });

      this.uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        this.uploadZone.style.backgroundColor = 'rgba(32,167,201,0.03)';
        this.uploadZone.style.borderColor = 'rgba(32,167,201,0.3)';
        this.handleFiles(e.dataTransfer.files);
      });

      this.uploadZone.addEventListener('click', () => {
        this.fileInput.click();
      });
    }

    // Input de archivo
    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => {
        this.handleFiles(e.target.files);
      });
    }
  }

  /**
   * Detecta tipo de archivo y ejecuta procesador correspondiente
   */
  handleFiles(files) {
    const fileArray = Array.from(files);
    const pdfs = fileArray.filter(f => f.type === 'application/pdf');
    const excels = fileArray.filter(f =>
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv')
    );

    if (pdfs.length > 0) {
      console.log(`📄 ${pdfs.length} archivo(s) PDF detectado(s)`);
      this.procesarPDFs(pdfs);
    }

    if (excels.length > 0) {
      console.log(`📊 ${excels.length} archivo(s) Excel detectado(s)`);
      // Llamar al procesador Excel existente
      if (window.procesarExcel) {
        window.procesarExcel(excels);
      }
    }
  }

  /**
   * Procesa múltiples archivos PDF
   */
  async procesarPDFs(files) {
    console.log(`🔄 Procesando ${files.length} PDF(s)...`);

    this.processedFiles = [];
    const resultados = [];

    for (const file of files) {
      try {
        const datos = await this.extraerDatosPDF(file);

        if (datos.success) {
          resultados.push({
            archivo: file.name,
            tipo_novedad: datos.tipo_novedad,
            cedula: datos.cedula,
            nombre: datos.nombre,
            estado: 'PROCESADO',
            datos: datos,
            validado: true
          });

          console.log(`✅ ${file.name}: ${datos.tipo_novedad}`);
        } else {
          resultados.push({
            archivo: file.name,
            estado: 'ERROR',
            error: datos.error || 'Error desconocido',
            validado: false
          });

          console.log(`❌ ${file.name}: ${datos.error}`);
        }
      } catch (error) {
        resultados.push({
          archivo: file.name,
          estado: 'ERROR',
          error: error.message,
          validado: false
        });

        console.error(`Error procesando ${file.name}:`, error);
      }
    }

    this.processedFiles = resultados;
    this.mostrarResultados(resultados);
    return resultados;
  }

  /**
   * Extrae datos de un PDF usando pdfplumber (backend)
   */
  async extraerDatosPDF(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          // Enviar al backend para procesamiento
          const formData = new FormData();
          formData.append('file', file);

          const response = await fetch('/api/procesar-pdf', {
            method: 'POST',
            body: formData
          });

          if (!response.ok) {
            resolve({
              success: false,
              error: `HTTP ${response.status}`
            });
            return;
          }

          const datos = await response.json();
          resolve(datos);
        } catch (error) {
          resolve({
            success: false,
            error: error.message
          });
        }
      };

      reader.onerror = () => {
        reject(new Error('Error al leer archivo'));
      };

      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Muestra tabla de resultados
   */
  mostrarResultados(resultados) {
    const exitosos = resultados.filter(r => r.validado).length;
    const fallidos = resultados.filter(r => !r.validado).length;

    console.log(`\n📊 RESUMEN:`);
    console.log(`  ✓ Procesados: ${exitosos}`);
    console.log(`  ✗ Errores: ${fallidos}`);
    console.log(`  Total: ${resultados.length}\n`);

    // Mostrar en tabla (integrar con tabla existente)
    this.actualizarTablaResultados(resultados);
  }

  /**
   * Actualiza tabla de resultados en la UI
   */
  actualizarTablaResultados(resultados) {
    // Buscar contenedor de tabla o crear uno
    let tablaContenedor = document.getElementById('tblResultadosImportacionPDF');

    if (!tablaContenedor) {
      tablaContenedor = document.createElement('div');
      tablaContenedor.id = 'tblResultadosImportacionPDF';
      tablaContenedor.className = 'table-wrap';

      const uploadZone = document.querySelector('.upload-zone');
      if (uploadZone && uploadZone.parentElement) {
        uploadZone.parentElement.insertAdjacentElement('afterend', tablaContenedor);
      }
    }

    let html = `
      <div class="table-header">
        <div class="table-title">Resultados de Importación PDF</div>
        <div class="hist-count" style="margin-left: auto; color: var(--cm-blue-light);">
          ${resultados.filter(r => r.validado).length}/${resultados.length} procesados exitosamente
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Archivo</th>
            <th>Tipo Novedad</th>
            <th>Cédula</th>
            <th>Nombre</th>
            <th>Estado</th>
            <th>Detalles</th>
          </tr>
        </thead>
        <tbody>
    `;

    resultados.forEach(resultado => {
      const estadoClass = resultado.validado ? 'badge-dev' : 'badge-ded';
      const estadoTexto = resultado.validado ? '✓ Listo' : '✗ Error';
      const detalles = resultado.validado
        ? `Datos extraídos: ${resultado.datos.cedula}`
        : resultado.error;

      html += `
        <tr>
          <td>${resultado.archivo}</td>
          <td><span class="badge ${estadoClass}" style="background: rgba(32,167,201,0.15); color: var(--cm-blue);">${resultado.tipo_novedad || '—'}</span></td>
          <td>${resultado.cedula || '—'}</td>
          <td>${resultado.nombre || '—'}</td>
          <td><span class="badge ${estadoClass}">${estadoTexto}</span></td>
          <td style="font-size: 12px; color: var(--muted);">${detalles}</td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    tablaContenedor.innerHTML = html;
  }

  /**
   * Envía datos procesados a la BD
   */
  async insertarEnBD(resultados) {
    const exitosos = resultados.filter(r => r.validado);

    if (exitosos.length === 0) {
      console.warn('No hay registros válidos para insertar');
      return;
    }

    console.log(`📤 Insertando ${exitosos.length} registro(s)...`);

    try {
      for (const resultado of exitosos) {
        const response = await fetch('/api/insertar-novedad-pdf', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            tipo_novedad: resultado.tipo_novedad,
            datos: resultado.datos
          })
        });

        if (response.ok) {
          console.log(`✅ Insertado: ${resultado.archivo}`);
        } else {
          console.error(`❌ Error insertando ${resultado.archivo}`);
        }
      }
    } catch (error) {
      console.error('Error en inserción:', error);
    }
  }

  /**
   * Exporta resultados a JSON
   */
  exportarJSON() {
    const json = JSON.stringify(this.processedFiles, null, 2);
    this.descargarArchivo(json, 'resultados_importacion_pdf.json', 'application/json');
  }

  /**
   * Exporta resultados a CSV
   */
  exportarCSV() {
    let csv = 'Archivo,Tipo Novedad,Cédula,Nombre,Estado\n';

    this.processedFiles.forEach(r => {
      csv += `"${r.archivo}","${r.tipo_novedad || ''}","${r.cedula || ''}","${r.nombre || ''}","${r.estado}"\n`;
    });

    this.descargarArchivo(csv, 'resultados_importacion_pdf.csv', 'text/csv');
  }

  /**
   * Descarga un archivo
   */
  descargarArchivo(contenido, nombre, tipo) {
    const blob = new Blob([contenido], { type });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  window.pdfImportModule = new PDFImportModule();
  console.log('✓ Módulo de importación PDF inicializado');
});
