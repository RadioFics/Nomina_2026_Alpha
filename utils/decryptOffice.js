// utils/decryptOffice.js
// ============================================================================
// Desencripta archivos Excel (.xlsx) protegidos con contraseña de Office
// usando msoffcrypto-tool (Python) como proceso auxiliar.
//
// El archivo original NO se modifica — la desencriptación ocurre en memoria.
// Si el archivo no está cifrado, el buffer original se devuelve sin cambios.
//
// Uso:
//   const { decryptIfNeeded } = require('./decryptOffice');
//   const cleanBuffer = await decryptIfNeeded(file.buffer);
//   file = { ...file, buffer: cleanBuffer };
// ============================================================================

const { spawnSync } = require('child_process');
require('dotenv').config();

// Contraseña leída del .env (NOMINA_XLSX_PWD)
const NOMINA_XLSX_PWD = process.env.NOMINA_XLSX_PWD || '';

// Firma de archivo Office cifrado (ECMA-376): empieza con magic bytes OLE2
const OLE2_MAGIC = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);

/**
 * Detecta si un buffer corresponde a un archivo Office cifrado.
 * Los .xlsx sin cifrar son ZIPs (empiezan con PK\x03\x04).
 * Los .xlsx cifrados son contenedores OLE2 (empiezan con D0CF11E0...).
 */
function isEncrypted(buffer) {
  if (!buffer || buffer.length < 8) return false;
  return buffer.slice(0, 8).equals(OLE2_MAGIC);
}

/**
 * Desencripta el buffer en memoria usando Python + msoffcrypto-tool.
 * Lanza error si la contraseña es incorrecta o msoffcrypto no está disponible.
 *
 * @param {Buffer} encryptedBuffer  Buffer del archivo cifrado
 * @param {string} [password]       Contraseña (usa NOMINA_XLSX_PWD del .env por defecto)
 * @returns {Buffer}                Buffer del archivo descifrado
 */
function decryptBuffer(encryptedBuffer, password) {
  const pwd = password || NOMINA_XLSX_PWD;

  if (!pwd) {
    throw new Error(
      'El archivo está protegido con contraseña pero NOMINA_XLSX_PWD ' +
      'no está definida en el archivo .env.\n' +
      'Agrega la línea:  NOMINA_XLSX_PWD=<contraseña>  al .env'
    );
  }

  // Script Python inline: lee stdin (cifrado) → escribe stdout (descifrado)
  const pyScript = `
import sys, io, msoffcrypto
raw = sys.stdin.buffer.read()
buf_in = io.BytesIO(raw)
office = msoffcrypto.OfficeFile(buf_in)
office.load_key(password=${JSON.stringify(pwd)})
buf_out = io.BytesIO()
office.decrypt(buf_out)
sys.stdout.buffer.write(buf_out.getvalue())
`.trim();

  const result = spawnSync('python3', ['-c', pyScript], {
    input:     encryptedBuffer,
    maxBuffer: 200 * 1024 * 1024,  // 200 MB máximo
    timeout:   30_000,              // 30 segundos
  });

  if (result.error) {
    throw new Error(
      `No se pudo ejecutar Python para descifrar el archivo: ${result.error.message}\n` +
      'Verifica que Python 3 y msoffcrypto-tool estén instalados:\n' +
      '  pip install msoffcrypto-tool'
    );
  }

  if (result.status !== 0) {
    const stderr = result.stderr ? result.stderr.toString().trim() : '';
    throw new Error(
      `Error al descifrar el archivo. Verifica que NOMINA_XLSX_PWD sea correcta.\n` +
      (stderr ? `Detalle: ${stderr}` : '')
    );
  }

  return result.stdout;
}

/**
 * Si el buffer está cifrado, lo descifra y devuelve el buffer limpio.
 * Si no está cifrado, devuelve el buffer original sin modificar.
 *
 * @param {Buffer} buffer
 * @param {string} [password]
 * @returns {Buffer}
 */
function decryptIfNeeded(buffer, password) {
  if (!isEncrypted(buffer)) return buffer;
  return decryptBuffer(buffer, password);
}

module.exports = { decryptIfNeeded, isEncrypted };
