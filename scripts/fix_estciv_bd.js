#!/usr/bin/env node
/**
 * fix_estciv_bd.js
 * ─────────────────────────────────────────────────────────────────
 * Actualiza COD_ESTCIV en GN_FUNCI cruzando el Excel de novedades
 * con los registros actuales de la base de datos MineDax.
 *
 * Generado automáticamente · 2026-05-04
 * Total registros a actualizar: 151
 * ─────────────────────────────────────────────────────────────────
 * Uso:
 *   cd Nomina_2026_Alpha
 *   node fix_estciv_bd.js
 */

require('dotenv').config();
const sql = require('mssql');

const config = {
  server:   process.env.SERVER,
  database: process.env.DATABASE,
  authentication: {
    type: 'default',
    options: { userName: process.env.UID, password: process.env.PWD }
  },
  options: { encrypt: false, trustServerCertificate: true, connectionTimeout: 15000, requestTimeout: 30000 }
};

// ── Registros a actualizar (generado desde Excel 2Q Abril 2026) ──────────────
const CAMBIOS = [
  { funci: 107, estciv: 2, nombre: 'OROPEZA MENDOZA VICTOR MANUEL', cedula: '6615269', texto: 'CASADO' },
  { funci: 128, estciv: 1, nombre: 'CARDOSO MARACAJA RAPHAEL CAPELLA', cedula: '8239369', texto: 'SOLTERO' },
  { funci: 159, estciv: 2, nombre: 'BUSTOS RUBIO RAFAEL ENRIQUE', cedula: '11004336', texto: 'CASADO' },
  { funci: 85, estciv: 2, nombre: 'OSSMA GOMEZ OMAR DAVID', cedula: '13511547', texto: 'CASADO' },
  { funci: 86, estciv: 2, nombre: 'HERRERA OSORIO JHON ALBERTO', cedula: '15447956', texto: 'CASADO' },
  { funci: 87, estciv: 2, nombre: 'LADINO ALVAREZ JHON JAIRO', cedula: '15923454', texto: 'CASADO' },
  { funci: 88, estciv: 1, nombre: 'ALVAREZ RINCON GERARDO ANTONIO', cedula: '15928324', texto: 'SOLTERO' },
  { funci: 90, estciv: 1, nombre: 'RAMIREZ RAMIREZ DIDIER DE JESUS', cedula: '15931551', texto: 'SOLTERO' },
  { funci: 91, estciv: 1, nombre: 'GUEVARA  JOSE DAVID', cedula: '15932818', texto: 'SOLTERO' },
  { funci: 92, estciv: 2, nombre: 'MONTES RINCON JOSE ROGELIO', cedula: '16053295', texto: 'CASADO' },
  { funci: 94, estciv: 1, nombre: 'OROZCO SALGADO JULIAN', cedula: '16070773', texto: 'SOLTERO' },
  { funci: 96, estciv: 0, nombre: 'LONDONO OCAMPO VIVIANA', cedula: '24339233', texto: 'DESCONOCIDO' },
  { funci: 97, estciv: 1, nombre: 'GALLEGO MEJIA BEATRIZ HELENA', cedula: '24743274', texto: 'SOLTERO' },
  { funci: 98, estciv: 0, nombre: 'IGLESIAS ESCUDERO KELLY JOHANA', cedula: '25215588', texto: 'DESCONOCIDO' },
  { funci: 100, estciv: 1, nombre: 'VALENCIA VALENCIA LUZ MARY', cedula: '33994016', texto: 'SOLTERO' },
  { funci: 101, estciv: 1, nombre: 'RANGEL CONDE OLGA', cedula: '33994809', texto: 'SOLTERO' },
  { funci: 102, estciv: 2, nombre: 'OSPINA SERRANO MARIA JULIANA', cedula: '37547926', texto: 'CASADO' },
  { funci: 103, estciv: 0, nombre: 'GARCIA SANCHEZ MICHELLY', cedula: '39178636', texto: 'DESCONOCIDO' },
  { funci: 104, estciv: 0, nombre: 'CORZO CONTRERAS MARIA ANGELICA', cedula: '56098617', texto: 'DESCONOCIDO' },
  { funci: 108, estciv: 1, nombre: 'BENITEZ CORREA JUAN DIEGO', cedula: '71315693', texto: 'SOLTERO' },
  { funci: 109, estciv: 1, nombre: 'PALACIOS ALVARADO CESAR AUGUSTO', cedula: '74188499', texto: 'SOLTERO' },
  { funci: 111, estciv: 2, nombre: 'HIGUERA GARZON RODOLFO', cedula: '74382199', texto: 'CASADO' },
  { funci: 112, estciv: 2, nombre: 'VALLEJO LONDOÑO ROBINSON', cedula: '75065818', texto: 'CASADO' },
  { funci: 113, estciv: 2, nombre: 'VALLEJO VALLEJO CARLOS ELIAS', cedula: '75067991', texto: 'CASADO' },
  { funci: 114, estciv: 2, nombre: 'CRUZ SANCHEZ MAURICIO JAVIER', cedula: '75079022', texto: 'CASADO' },
  { funci: 116, estciv: 2, nombre: 'SUAREZ GOMEZ ALEJANDRO', cedula: '75102710', texto: 'CASADO' },
  { funci: 117, estciv: 0, nombre: 'OSPINA HINCAPIE HECTOR DAVID', cedula: '75103216', texto: 'DESCONOCIDO' },
  { funci: 118, estciv: 0, nombre: 'CANAS FRANCO DIEGO EDISON', cedula: '75103472', texto: 'DESCONOCIDO' },
  { funci: 119, estciv: 1, nombre: 'GIRALDO MORALES JONATHAN', cedula: '75107139', texto: 'SOLTERO' },
  { funci: 120, estciv: 1, nombre: 'TANGARIFE GONZALEZ JORGE HUGO', cedula: '75144193', texto: 'SOLTERO' },
  { funci: 121, estciv: 1, nombre: 'SANTOS NIETO CARLOS ANDRES', cedula: '79627976', texto: 'SOLTERO' },
  { funci: 122, estciv: 2, nombre: 'PEÑUELA GOMEZ JAIME HUMBERTO', cedula: '79748522', texto: 'CASADO' },
  { funci: 162, estciv: 2, nombre: 'ARDILA CASTRO JOSE MARIA', cedula: '79779721', texto: 'CASADO' },
  { funci: 124, estciv: 2, nombre: 'ESPITIA MONTOYA IVAN DARIO', cedula: '80014013', texto: 'CASADO' },
  { funci: 126, estciv: 0, nombre: 'GUZMAN MONTANEZ JORGE ELIECER', cedula: '80083229', texto: 'DESCONOCIDO' },
  { funci: 127, estciv: 2, nombre: 'SABRICA BUENDIA CARLOS ANDRES', cedula: '80203035', texto: 'CASADO' },
  { funci: 129, estciv: 1, nombre: 'CARMONA QUIROZ MARIO FERNANDO', cedula: '86086222', texto: 'SOLTERO' },
  { funci: 130, estciv: 1, nombre: 'RODRGUEZ ROJAS JOSE ANTONIO', cedula: '91531957', texto: 'SOLTERO' },
  { funci: 131, estciv: 2, nombre: 'HIDALGO CASTILLO YESID', cedula: '93341202', texto: 'CASADO' },
  { funci: 132, estciv: 1, nombre: 'TILANO MONTOYA LAURA', cedula: '1001014188', texto: 'SOLTERO' },
  { funci: 41, estciv: 1, nombre: 'GAÑAN BUENO JOSE ALBEIRO', cedula: '1059710108', texto: 'SOLTERO' },
  { funci: 42, estciv: 0, nombre: 'DIAZ REYES ANDERSON DAVID', cedula: '1059713194', texto: 'DESCONOCIDO' },
  { funci: 43, estciv: 0, nombre: 'TAPASCO CHAURRA DAVINSON', cedula: '1059713241', texto: 'DESCONOCIDO' },
  { funci: 44, estciv: 0, nombre: 'GARCIA GALVIS OSCAR ALEJANDRO', cedula: '1059810513', texto: 'DESCONOCIDO' },
  { funci: 45, estciv: 1, nombre: 'CIFUENTES ARIAS JUAN ESTEBAN', cedula: '1059811303', texto: 'SOLTERO' },
  { funci: 46, estciv: 1, nombre: 'BERMUDEZ SERNA JULIAN DAVID', cedula: '1060267953', texto: 'SOLTERO' },
  { funci: 156, estciv: 1, nombre: 'ZAPATA CASTAÑO VANNESA', cedula: '1060587212', texto: 'SOLTERO' },
  { funci: 157, estciv: 1, nombre: 'ALARCON ZAMORA YILMER ANDRES', cedula: '1060587214', texto: 'SOLTERO' },
  { funci: 158, estciv: 1, nombre: 'TORO AMARILES SANTIAGO', cedula: '1060587723', texto: 'SOLTERO' },
  { funci: 48, estciv: 1, nombre: 'ARROYAVE MONTOYA ELIZABETH', cedula: '1060588957', texto: 'SOLTERO' },
  { funci: 49, estciv: 1, nombre: 'VINASCO LOAIZA JOSE TIBERIO', cedula: '1060589612', texto: 'SOLTERO' },
  { funci: 51, estciv: 2, nombre: 'GAÑAN TAPASCO VICTOR JULIO', cedula: '1060592188', texto: 'CASADO' },
  { funci: 52, estciv: 2, nombre: 'ARREDONDO ANZOLA DANIEL ALAIN', cedula: '1060592562', texto: 'CASADO' },
  { funci: 53, estciv: 1, nombre: 'GALEANO AYALA GLORIA EDITH', cedula: '1060594098', texto: 'SOLTERO' },
  { funci: 55, estciv: 1, nombre: 'PIEDRAHITA CARTAGENA DANIEL ARMANDO', cedula: '1060594638', texto: 'SOLTERO' },
  { funci: 56, estciv: 1, nombre: 'RIOS MARIN JUAN FELIPE', cedula: '1060594799', texto: 'SOLTERO' },
  { funci: 57, estciv: 1, nombre: 'LEON GIRALDO FELIPE', cedula: '1060596363', texto: 'SOLTERO' },
  { funci: 58, estciv: 1, nombre: 'ALARCON TEJADA JUAN PABLO', cedula: '1060596650', texto: 'SOLTERO' },
  { funci: 59, estciv: 1, nombre: 'SERNA VILLADA VALENTINA', cedula: '1060596935', texto: 'SOLTERO' },
  { funci: 60, estciv: 1, nombre: 'RODRIGUEZ RODRIGUEZ ANLLY PAOLA', cedula: '1060596951', texto: 'SOLTERO' },
  { funci: 62, estciv: 1, nombre: 'FRANCO LLANES JUAN DIEGO', cedula: '1060597775', texto: 'SOLTERO' },
  { funci: 63, estciv: 1, nombre: 'GUZMAN MEJIA ANA MARIA', cedula: '1060598066', texto: 'SOLTERO' },
  { funci: 64, estciv: 1, nombre: 'LONDOÑO VANEGAS DAVID', cedula: '1060653592', texto: 'SOLTERO' },
  { funci: 65, estciv: 1, nombre: 'PACHECO GALEANO MOISES ALBERTO', cedula: '1065004568', texto: 'SOLTERO' },
  { funci: 66, estciv: 0, nombre: 'PATERNINA POLO JESSICA', cedula: '1067908034', texto: 'DESCONOCIDO' },
  { funci: 67, estciv: 1, nombre: 'SANCHEZ MASEA YOMAR JAVIER', cedula: '1071351401', texto: 'SOLTERO' },
  { funci: 68, estciv: 1, nombre: 'GUAZA VELASCO YOINER JAVIER', cedula: '1095510911', texto: 'SOLTERO' },
  { funci: 69, estciv: 1, nombre: 'PINILLA REYES OSCAR JAVIER', cedula: '1098668023', texto: 'SOLTERO' },
  { funci: 70, estciv: 0, nombre: 'MENDOZA AFANADOR GERSON', cedula: '1098680474', texto: 'DESCONOCIDO' },
  { funci: 71, estciv: 0, nombre: 'RIVEROS RUEDA ORLANDO', cedula: '1098683398', texto: 'DESCONOCIDO' },
  { funci: 72, estciv: 1, nombre: 'OTERO CASTILLO IVON JOHANA', cedula: '1098688603', texto: 'SOLTERO' },
  { funci: 73, estciv: 1, nombre: 'PEDROZA URIBE LAURA MARCELA', cedula: '1100950267', texto: 'SOLTERO' },
  { funci: 74, estciv: 2, nombre: 'BANQUEZ MATURANA MIGUEL', cedula: '1101440352', texto: 'CASADO' },
  { funci: 77, estciv: 2, nombre: 'ALVAREZ GALEANO JUAN DAVID', cedula: '1128391597', texto: 'CASADO' },
  { funci: 78, estciv: 2, nombre: 'MONTOYA MONTOYA PABLO ESTEBAN', cedula: '1128415118', texto: 'CASADO' },
  { funci: 79, estciv: 1, nombre: 'MARIN ESTRADA YURANY', cedula: '1128422824', texto: 'SOLTERO' },
  { funci: 160, estciv: 1, nombre: 'AREIZA PEÑA ANDRES', cedula: '1128455815', texto: 'SOLTERO' },
  { funci: 161, estciv: 1, nombre: 'GRANADA GIRON ARTURO ALEXIS', cedula: '1143826339', texto: 'SOLTERO' },
  { funci: 81, estciv: 1, nombre: 'DAVID VALLE SANTIAGO', cedula: '1152193844', texto: 'SOLTERO' },
  { funci: 82, estciv: 1, nombre: 'VILLAMIL SEDANO SANTIAGO', cedula: '1192799435', texto: 'SOLTERO' },
  { funci: 83, estciv: 1, nombre: 'OSORIO DIAZ JASON STEVENS', cedula: '1192904166', texto: 'SOLTERO' },
  { funci: 84, estciv: 1, nombre: 'MONSALVE ESTRADA JUAN SEBASTIAN', cedula: '1193029566', texto: 'SOLTERO' },
  { funci: 3, estciv: 2, nombre: 'GRANADA VALENCIA JAIME', cedula: '10276733', texto: 'CASADO' },
  { funci: 133, estciv: 1, nombre: 'OCAMPO PALACO SERGIO ANDRES', cedula: '1001603682', texto: 'SOLTERO' },
  { funci: 164, estciv: 1, nombre: 'GARCIA AYALA JUAN ESTEBAN', cedula: '1002545489', texto: 'SOLTERO' },
  { funci: 134, estciv: 1, nombre: 'LONDOÑO GIL SIMON', cedula: '1002591008', texto: 'SOLTERO' },
  { funci: 135, estciv: 1, nombre: 'RAMIREZ SANCHEZ JIMENA', cedula: '1002754987', texto: 'SOLTERO' },
  { funci: 165, estciv: 1, nombre: 'MARIN GARCIA YENY ALEXANDRA', cedula: '1002755126', texto: 'SOLTERO' },
  { funci: 136, estciv: 1, nombre: 'MORENO LARGO JHAN CARLOS', cedula: '1002814576', texto: 'SOLTERO' },
  { funci: 137, estciv: 1, nombre: 'MORENO QUINCHIA SEBASTIAN', cedula: '1002900089', texto: 'SOLTERO' },
  { funci: 138, estciv: 1, nombre: 'VELARDE MARULANDA YULIANA', cedula: '1002900275', texto: 'SOLTERO' },
  { funci: 139, estciv: 1, nombre: 'HIGINIO CRUZ DANNA GERALDINE', cedula: '1002900482', texto: 'SOLTERO' },
  { funci: 166, estciv: 1, nombre: 'LEON QUICENO VALENTINA', cedula: '1002900611', texto: 'SOLTERO' },
  { funci: 140, estciv: 1, nombre: 'RODRIGUEZ FLOREZ JUAN FELIPE', cedula: '1002900779', texto: 'SOLTERO' },
  { funci: 167, estciv: 1, nombre: 'ZAPATA CASTAÑO JENNY NATHALIA', cedula: '1002900824', texto: 'SOLTERO' },
  { funci: 141, estciv: 1, nombre: 'VALENCIA RAMIREZ NIXON HERNEY', cedula: '1002901033', texto: 'SOLTERO' },
  { funci: 142, estciv: 1, nombre: 'FLOREZ AGUDELO MARIA DANIELA', cedula: '1002901077', texto: 'SOLTERO' },
  { funci: 143, estciv: 0, nombre: 'GOMEZ GRISALES JUAN SEBASTIAN', cedula: '1002969887', texto: 'DESCONOCIDO' },
  { funci: 144, estciv: 1, nombre: 'BEDOYA SUAREZ JOSE DARIO', cedula: '1005088926', texto: 'SOLTERO' },
  { funci: 145, estciv: 1, nombre: 'DIAZ ACEVEDO HAROLD IGNACIO', cedula: '1005089085', texto: 'SOLTERO' },
  { funci: 146, estciv: 1, nombre: 'GAÑAN BUENO SAMUEL HUMBERTO', cedula: '1005098717', texto: 'SOLTERO' },
  { funci: 147, estciv: 1, nombre: 'BOTERO NEQUIRUCAMA YEISON ESTIVEN', cedula: '1007224481', texto: 'SOLTERO' },
  { funci: 148, estciv: 1, nombre: 'JIMENEZ BENAVIDES MARIANA', cedula: '1007227275', texto: 'SOLTERO' },
  { funci: 149, estciv: 1, nombre: 'BUENO GANON LUIS MANUEL', cedula: '1007441856', texto: 'SOLTERO' },
  { funci: 150, estciv: 1, nombre: 'TRILLERAS SANCHEZ JULIAN ALEXIS', cedula: '1007593984', texto: 'SOLTERO' },
  { funci: 151, estciv: 1, nombre: 'DIAZ RODRIGUEZ RONALD SNEIDER', cedula: '1007651838', texto: 'SOLTERO' },
  { funci: 152, estciv: 1, nombre: 'RIOS HERRERA YENIFER LEANDRA', cedula: '1007651973', texto: 'SOLTERO' },
  { funci: 153, estciv: 1, nombre: 'BAÑOL TAPASCO YEISON ESTIVEN', cedula: '1007694183', texto: 'SOLTERO' },
  { funci: 154, estciv: 1, nombre: 'CHALARCA GARCIA KEVIN GIOVANY', cedula: '1007808097', texto: 'SOLTERO' },
  { funci: 155, estciv: 1, nombre: 'LENGUA CALVO CARLOS FERNANDO', cedula: '1007808107', texto: 'SOLTERO' },
  { funci: 1, estciv: 1, nombre: 'HERNANDEZ LARGO JUAN FELIPE', cedula: '1007808313', texto: 'SOLTERO' },
  { funci: 2, estciv: 1, nombre: 'LONDONO VALLE SEBASTIAN', cedula: '1017222157', texto: 'SOLTERO' },
  { funci: 168, estciv: 1, nombre: 'CARDONA BETANCOURT SARA', cedula: '1020816676', texto: 'SOLTERO' },
  { funci: 169, estciv: 1, nombre: 'OCHOA MARULANDA DEIMER', cedula: '1025763301', texto: 'SOLTERO' },
  { funci: 4, estciv: 0, nombre: 'RENDON HOYOS VICTOR ALEJANDRO', cedula: '1027885783', texto: 'DESCONOCIDO' },
  { funci: 5, estciv: 1, nombre: 'ARISMENDY AGUDELO ALEJANDRA', cedula: '1033340485', texto: 'SOLTERO' },
  { funci: 6, estciv: 1, nombre: 'LADINO GONZALEZ CAMILO ANDRES', cedula: '1034776899', texto: 'SOLTERO' },
  { funci: 7, estciv: 1, nombre: 'CALLE PALMETT JUAN ESTEBAN', cedula: '1034986488', texto: 'SOLTERO' },
  { funci: 8, estciv: 1, nombre: 'MEJIA OSORIO MANUELA', cedula: '1035871844', texto: 'SOLTERO' },
  { funci: 9, estciv: 2, nombre: 'RICO GODOY CATHERINE', cedula: '1036625005', texto: 'CASADO' },
  { funci: 170, estciv: 1, nombre: 'MARIN QUINTERO MARIA FERNANDA', cedula: '1036961944', texto: 'SOLTERO' },
  { funci: 10, estciv: 1, nombre: 'MAZO OLARTE LEIDY SULAY', cedula: '1037449092', texto: 'SOLTERO' },
  { funci: 12, estciv: 1, nombre: 'AMAYA LOPEZ CAROLINA', cedula: '1037614187', texto: 'SOLTERO' },
  { funci: 13, estciv: 2, nombre: 'ORTIZ LOPEZ WILMAR ALEXIS', cedula: '1037624001', texto: 'CASADO' },
  { funci: 14, estciv: 1, nombre: 'BETANCOURT TAMAYO NESTOR IVAN', cedula: '1039023530', texto: 'SOLTERO' },
  { funci: 15, estciv: 1, nombre: 'RAMIREZ OBANDO STIVEN', cedula: '1039198133', texto: 'SOLTERO' },
  { funci: 16, estciv: 1, nombre: 'RAMIREZ ORTIZ DANIELA', cedula: '1039462457', texto: 'SOLTERO' },
  { funci: 17, estciv: 1, nombre: 'OSPINA ECHEVERRY ANGELA YULIETH', cedula: '1045046238', texto: 'SOLTERO' },
  { funci: 18, estciv: 2, nombre: 'LOMBANA GOMEZ VALENTINA', cedula: '1053764443', texto: 'CASADO' },
  { funci: 19, estciv: 2, nombre: 'VARGAS GONZALEZ NATALIA', cedula: '1053765183', texto: 'CASADO' },
  { funci: 20, estciv: 1, nombre: 'LEON MARULANDA SERGIO ANDRES', cedula: '1053765412', texto: 'SOLTERO' },
  { funci: 21, estciv: 2, nombre: 'RAMIREZ MOSQUERA HENRY ALEXANDER', cedula: '1053784995', texto: 'CASADO' },
  { funci: 22, estciv: 1, nombre: 'ARANGO TRUJILLO MARCELO', cedula: '1053823924', texto: 'SOLTERO' },
  { funci: 23, estciv: 1, nombre: 'OCAMPO SALAZAR LAURA DAYANA', cedula: '1053838548', texto: 'SOLTERO' },
  { funci: 24, estciv: 1, nombre: 'ARICAPA TREJOS VAIRON CAMILO', cedula: '1053842239', texto: 'SOLTERO' },
  { funci: 25, estciv: 1, nombre: 'CORDOBA SANCHEZ LAURA', cedula: '1053855982', texto: 'SOLTERO' },
  { funci: 26, estciv: 1, nombre: 'NARANJO CARDENAS PAULA MARIA', cedula: '1053856093', texto: 'SOLTERO' },
  { funci: 27, estciv: 1, nombre: 'OROZCO RIOS JONATHAN', cedula: '1053857485', texto: 'SOLTERO' },
  { funci: 28, estciv: 1, nombre: 'PARRA MOSQUERA JUAN DIEGO', cedula: '1053868509', texto: 'SOLTERO' },
  { funci: 29, estciv: 1, nombre: 'ALVAREZ HURTADO ANGELA MARCELA', cedula: '1053871088', texto: 'SOLTERO' },
  { funci: 30, estciv: 1, nombre: 'LOPEZ GIRALDO MARIANA', cedula: '1053871279', texto: 'SOLTERO' },
  { funci: 31, estciv: 1, nombre: 'RESTREPO RENDON LUISA MARIA', cedula: '1053872960', texto: 'SOLTERO' },
  { funci: 32, estciv: 1, nombre: 'SANTANA PEREZ JULIANA ANDREA', cedula: '1054990613', texto: 'SOLTERO' },
  { funci: 33, estciv: 1, nombre: 'GIL JIMENEZ ANYI DAHIANA', cedula: '1054997974', texto: 'SOLTERO' },
  { funci: 34, estciv: 1, nombre: 'IZQUIERDO DIAZ MARLON ARTURO', cedula: '1058228119', texto: 'SOLTERO' },
  { funci: 35, estciv: 1, nombre: 'VELASQUEZ IZQUIERDO LAURA', cedula: '1058228240', texto: 'SOLTERO' },
  { funci: 36, estciv: 1, nombre: 'MORENO CASTRILLON YANETH ORLANDY', cedula: '1058229120', texto: 'SOLTERO' },
  { funci: 37, estciv: 1, nombre: 'CASTRO ESCOBAR YESMITH VERONICA', cedula: '1058230681', texto: 'SOLTERO' },
  { funci: 38, estciv: 1, nombre: 'MONTOYA SOTO MAYERLY ANDREA', cedula: '1059694220', texto: 'SOLTERO' },
  { funci: 39, estciv: 1, nombre: 'TREJOS DIAZ ANDREA', cedula: '1059694771', texto: 'SOLTERO' },
  { funci: 40, estciv: 1, nombre: 'MAFLA SOTO CONNY DAYANA', cedula: '1059706306', texto: 'SOLTERO' }
];

const NOM_ESTCIV = {
  0: 'Sin asignar', 1: 'Soltero/a', 2: 'Casado/a',
  3: 'Unión libre',  4: 'Divorciado/a', 5: 'Separado/a', 6: 'Viudo/a'
};

// ── Helpers de consola ────────────────────────────────────────────────────────
const c = { reset:'\x1b[0m', green:'\x1b[32m', red:'\x1b[31m', yellow:'\x1b[33m', cyan:'\x1b[36m', bold:'\x1b[1m', dim:'\x1b[2m' };
const log  = (...a) => console.log(...a);
const ok   = (m) => log(`  ${c.green}✓${c.reset} ${m}`);
const fail = (m) => log(`  ${c.red}✗${c.reset} ${m}`);
const info = (m) => log(`  ${c.cyan}→${c.reset} ${m}`);

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  log(`\n${c.bold}${c.cyan}════════════════════════════════════════════════════════${c.reset}`);
  log(`${c.bold}   FIX COD_ESTCIV · GN_FUNCI · MineDax${c.reset}`);
  log(`${c.cyan}════════════════════════════════════════════════════════${c.reset}\n`);
  log(`  Registros a procesar: ${c.bold}151${c.reset}`);
  log(`  Servidor:             ${process.env.SERVER}`);
  log(`  Base de datos:        ${process.env.DATABASE}\n`);

  let pool, transaction;
  let success = 0, errors = 0;
  const errList = [];

  try {
    // ── Conectar ────────────────────────────────────────────────
    info('Conectando a SQL Server...');
    pool = await sql.connect(config);
    ok(`Conexión establecida`);

    // ── Verificar estado previo ──────────────────────────────────
    const prev = await pool.request().query(
      `SELECT COD_ESTCIV, COUNT(*) AS cnt FROM GN_FUNCI GROUP BY COD_ESTCIV ORDER BY COD_ESTCIV`
    );
    log(`\n  ${c.dim}Estado previo de COD_ESTCIV en GN_FUNCI:${c.reset}`);
    prev.recordset.forEach(r => {
      const lbl = r.COD_ESTCIV === null ? 'NULL (sin asignar)' : `${r.COD_ESTCIV} - ${NOM_ESTCIV[r.COD_ESTCIV] || '?'}`;
      log(`    ${lbl.padEnd(25)} → ${r.cnt} registros`);
    });

    // ── Transacción ──────────────────────────────────────────────
    log(`\n  ${c.yellow}Iniciando transacción...${c.reset}`);
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const BATCH = 20;
    for (let i = 0; i < CAMBIOS.length; i += BATCH) {
      const slice = CAMBIOS.slice(i, i + BATCH);
      for (const r of slice) {
        try {
          const req = new sql.Request(transaction);
          req.input('ec',  sql.Int,     r.estciv);
          req.input('fid', sql.Int,     r.funci);
          await req.query(`
            UPDATE GN_FUNCI
            SET COD_ESTCIV = @ec,
                ACT_USUA   = 'MineDax ',
                ACT_HORA   = GETDATE()
            WHERE COD_FUNCI = @fid
          `);
          success++;
        } catch (e) {
          errors++;
          errList.push(`  COD_FUNCI=${r.funci} (${r.cedula} ${r.nombre}): ${e.message}`);
        }
      }
      const pct = Math.round(((i + slice.length) / CAMBIOS.length) * 100);
      process.stdout.write(`\r  Progreso: [${('█'.repeat(Math.floor(pct/5))).padEnd(20,' ')}] ${pct}% (${i + slice.length}/${CAMBIOS.length}) `);
    }
    log('');

    if (errors === 0) {
      await transaction.commit();
      ok(`Transacción confirmada (COMMIT)`);
    } else {
      await transaction.rollback();
      fail(`Se encontraron ${errors} errores — ROLLBACK ejecutado`);
    }

    // ── Estado posterior ─────────────────────────────────────────
    if (errors === 0) {
      const post = await pool.request().query(
        `SELECT COD_ESTCIV, COUNT(*) AS cnt FROM GN_FUNCI GROUP BY COD_ESTCIV ORDER BY COD_ESTCIV`
      );
      log(`\n  ${c.dim}Estado posterior de COD_ESTCIV en GN_FUNCI:${c.reset}`);
      post.recordset.forEach(r => {
        const lbl = r.COD_ESTCIV === null ? 'NULL (sin asignar)' : `${r.COD_ESTCIV} - ${NOM_ESTCIV[r.COD_ESTCIV] || '?'}`;
        log(`    ${lbl.padEnd(25)} → ${r.cnt} registros`);
      });
    }

  } catch (e) {
    if (transaction) { try { await transaction.rollback(); } catch(_) {} }
    fail(`Error crítico: ${e.message}`);
  } finally {
    if (pool) await sql.close();
  }

  // ── Resumen ──────────────────────────────────────────────────
  log(`\n${c.bold}${c.cyan}════════════════════════════════════════════════════════${c.reset}`);
  log(`${c.bold}  RESUMEN FINAL${c.reset}`);
  log(`${c.cyan}════════════════════════════════════════════════════════${c.reset}`);
  log(`  ${c.green}Actualizados correctamente: ${success}${c.reset}`);
  if (errors > 0) {
    log(`  ${c.red}Con error:                  ${errors}${c.reset}`);
    errList.forEach(e => log(`  ${c.red}${e}${c.reset}`));
  }
  log(`${c.cyan}════════════════════════════════════════════════════════${c.reset}\n`);
})();
