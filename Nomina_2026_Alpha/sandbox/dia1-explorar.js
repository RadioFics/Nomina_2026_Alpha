const ExcelJS = require('exceljs');

async function explorarExcel(rutaArchivo) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(rutaArchivo);

  workbook.eachSheet((hoja, id) => {
    console.log(`Hoja ${id}: "${hoja.name}" - ${hoja.rowCount} filas`);
  });
}

explorarExcel(process.argv[2]).catch(console.error);
