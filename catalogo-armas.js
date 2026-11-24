// ============================================================
// CATÁLOGO DE ARMAS
// Base de consulta de modelos de armas: junta as armas cadastradas no Gestão
// (sem repetir o mesmo modelo/calibre) com modelos lidos nos catálogos dos
// fabricantes na internet. Inclui o verificador "Pode cadastrar em qual acervo?".
// ============================================================

// ---------- Modelos lidos na internet (catálogos/sites dos fabricantes, nov/2026) ----------
// [marca, modelo, espécie(P/R/C/E), calibre, funcionamento(S/R/T), capacidade, nº canos, compr. cano (mm), nº raias, sentido raias, país, fonte]
const _CAT_FONTES = {
  tx: 'https://taurusexport.com/en/products',
  cbc: 'https://www.cbc.com.br/armas-longas',
  imbel: 'https://www.imbel.gov.br/armamento-e-cutelaria',
  glock: 'https://eu.glock.com/en/products/pistols',
  iwi: 'https://iwi.us/',
  bersa: 'https://bersa.com.ar/armas/',
  hatsan: 'https://hatsan.com.tr/',
  cd: 'https://chiappausa.com/charles-daly-store/',
  ruger: 'https://ruger.com/products/1022/overview.html',
  benelli: 'https://www.benelli.it/it/arma/super-black-eagle-3',
  rossi: 'https://rossiusa.com/',
  boito: 'https://en.wikipedia.org/wiki/E.R._Amantino',
  boitoGm: 'https://www.gunmart.net/gun-reviews/shotguns/',
};
const CATALOGO_ARMAS_INTERNET = [
  // TAURUS (Brasil)
  ['Taurus', 'G2C', 'P', '9x19mm', 'S', '12', '1', '81', '', '', '', 'tx'],
  ['Taurus', 'G3', 'P', '9x19mm', 'S', '17', '1', '102', '', '', '', 'tx'],
  ['Taurus', 'G3 T.O.R.O', 'P', '9x19mm', 'S', '17', '1', '', '', '', '', 'tx'],
  ['Taurus', 'G3C', 'P', '9x19mm', 'S', '12', '1', '83', '', '', '', 'tx'],
  ['Taurus', 'G3C T.O.R.O', 'P', '9x19mm', 'S', '12', '1', '81', '', '', '', 'tx'],
  ['Taurus', 'G3X', 'P', '9x19mm', 'S', '15', '1', '', '', '', '', 'tx'],
  ['Taurus', 'GX4', 'P', '9x19mm', 'S', '11/13', '1', '78', '', '', '', 'tx'],
  ['Taurus', 'GX4 XL', 'P', '9x19mm', 'S', '13', '1', '94', '', '', '', 'tx'],
  ['Taurus', 'TS9', 'P', '9x19mm', 'S', '17', '1', '102', '', '', '', 'tx'],
  ['Taurus', 'TH9', 'P', '9x19mm', 'S', '17', '1', '108', '', '', '', 'tx'],
  ['Taurus', 'TH9C', 'P', '9x19mm', 'S', '17', '1', '90', '', '', '', 'tx'],
  ['Taurus', 'TH40', 'P', '.40 S&W', 'S', '15', '1', '108', '', '', '', 'tx'],
  ['Taurus', 'PT 92', 'P', '9x19mm', 'S', '17', '1', '127', '', '', '', 'tx'],
  ['Taurus', 'PT 1911', 'P', '.45 ACP', 'S', '8', '1', '127', '', '', '', 'tx'],
  ['Taurus', 'PT 917', 'P', '9x19mm', 'S', '17', '1', '109', '', '', '', 'tx'],
  ['Taurus', 'PT 58 HC', 'P', '.380 ACP', 'S', '15', '1', '102', '', '', '', 'tx'],
  ['Taurus', 'RT 856', 'R', '.38 SPL', 'R', '6', '1', '51', '', '', '', 'tx'],
  ['Taurus', 'RT 856 T.O.R.O', 'R', '.38 SPL', 'R', '6', '1', '76', '', '', '', 'tx'],
  ['Taurus', 'RT 82', 'R', '.38 SPL', 'R', '6', '1', '102', '', '', '', 'tx'],
  ['Taurus', 'RT 605', 'R', '.357 Magnum', 'R', '5', '1', '51', '', '', '', 'tx'],
  ['Taurus', 'RT 627 Tracker', 'R', '.357 Magnum', 'R', '7', '1', '165', '', '', '', 'tx'],
  ['Taurus', 'RT 942', 'R', '.22 LR', 'R', '8', '1', '51', '', '', '', 'tx'],
  ['Taurus', 'Raging Bull 444', 'R', '.44 Magnum', 'R', '6', '1', '165', '', '', '', 'tx'],
  ['Taurus', 'Raging Hunter 44', 'R', '.44 Magnum', 'R', '6', '1', '213', '', '', '', 'tx'],
  ['Taurus', 'Raging Hunter 454', 'R', '.454 Casull', 'R', '5', '1', '130', '', '', '', 'tx'],
  ['Taurus', 'Judge Magnum', 'R', '.45 Colt / .410', 'R', '5', '1', '76', '', '', '', 'tx'],
  ['Taurus', 'Raging Judge 513', 'R', '.454 Casull / .45 Colt / .410', 'R', '6', '1', '165', '', '', '', 'tx'],
  ['Taurus', 'CTT40', 'C', '.40 S&W', 'S', '30', '1', '200', '', '', '', 'tx'],
  ['Taurus', 'T4', 'C', '5.56x45mm', 'S', '30', '1', '368', '', '', '', 'tx'],
  // CBC (Brasil)
  ['CBC', '7022', 'C', '.22 LR', 'S', '10', '1', '533', '', '', '', 'cbc'],
  ['CBC', '7022 Way', 'C', '.22 LR', 'S', '10', '1', '533', '', '', '', 'cbc'],
  ['CBC', 'Delta', 'C', '.22 LR', 'S', '25', '1', '368', '', '', '', 'cbc'],
  ['CBC', 'Delta Magnum', 'C', '.22 WMR', 'S', '25', '1', '368', '', '', '', 'cbc'],
  ['CBC', '7122M Magnum', 'C', '.22 WMR', 'S', '10', '1', '533', '', '', '', 'cbc'],
  ['CBC', '8122', 'C', '.22 LR', 'R', '10', '1', '584', '', '', '', 'cbc'],
  ['CBC', '8122 Magnum', 'C', '.22 WMR', 'R', '5', '1', '533', '', '', '', 'cbc'],
  ['CBC', '8117', 'C', '.17 HMR', 'R', '5', '1', '533', '', '', '', 'cbc'],
  ['CBC', 'Rio Bravo', 'C', '.22 LR', 'R', '15', '1', '457', '', '', '', 'cbc'],
  ['CBC', 'Rio Bravo', 'C', '.22 WMR', 'R', '12', '1', '508', '', '', '', 'cbc'],
  ['CBC', 'Pump Action', 'C', '.22 LR', 'R', '15', '1', '457', '', '', '', 'cbc'],
  ['CBC', 'Pump Action', 'C', '.22 WMR', 'R', '12', '1', '508', '', '', '', 'cbc'],
  ['CBC', 'Rio Grande', 'C', '.357 Magnum', 'R', '10', '1', '508', '', '', '', 'cbc'],
  ['CBC', 'Lever Action', 'C', '.38 SPL', 'R', '8 a 12', '1', '406 a 610', '', '', '', 'cbc'],
  ['CBC', 'Lever Action', 'C', '.357 Magnum', 'R', '8 a 12', '1', '419 a 610', '', '', '', 'cbc'],
  ['CBC', 'Lever Action', 'C', '.44-40 Winchester', 'R', '10', '1', '508', '', '', '', 'cbc'],
  ['CBC', 'Lever Action', 'C', '.44 Magnum', 'R', '10 a 12', '1', '508 a 610', '', '', '', 'cbc'],
  ['CBC', 'Lever Action', 'C', '.454 Casull', 'R', '9', '1', '508', '', '', '', 'cbc'],
  ['CBC', 'Ranger', 'C', '.308 Winchester', 'R', '5', '1', '457 a 610', '', '', '', 'cbc'],
  ['CBC', 'Pump Military 3.0', 'E', '12', 'R', '5 a 7', '1', '356 a 610', '', '', '', 'cbc'],
  ['CBC', 'Savana', 'E', '12', 'R', '10', '1', '711', '', '', '', 'cbc'],
  ['CBC', 'Montenegro', 'E', '12', 'T', '1', '1', '711', '', '', '', 'cbc'],
  ['CBC', 'Montenegro', 'E', '20', 'T', '1', '1', '711', '', '', '', 'cbc'],
  ['CBC', 'Montenegro', 'E', '28', 'T', '1', '1', '711', '', '', '', 'cbc'],
  ['CBC', 'Montenegro', 'E', '32', 'T', '1', '1', '711', '', '', '', 'cbc'],
  ['CBC', 'Montenegro', 'E', '36', 'T', '1', '1', '711', '', '', '', 'cbc'],
  // IMBEL (Brasil)
  ['Imbel', 'GC MD1', 'P', '.380 ACP', 'S', '17/19', '1', '', '', '', '', 'imbel'],
  ['Imbel', 'GC MD2', 'P', '.380 ACP', 'S', '17/19', '1', '', '', '', '', 'imbel'],
  ['Imbel', 'GC MD1', 'P', '9x19mm', 'S', '16', '1', '', '', '', '', 'imbel'],
  ['Imbel', 'TC MD6', 'P', '9x19mm', 'S', '16', '1', '', '', '', '', 'imbel'],
  ['Imbel', 'TC MD6', 'P', '.40 S&W', 'S', '15', '1', '', '', '', '', 'imbel'],
  ['Imbel', 'GC MD7', 'P', '.40 S&W', 'S', '15', '1', '', '', '', '', 'imbel'],
  ['Imbel', 'IA2 Carabina', 'C', '5.56x45mm', 'S', '30', '1', '', '', '', '', 'imbel'],
  ['Imbel', 'IA2 Carabina', 'C', '7.62x51mm', 'S', '20', '1', '', '', '', '', 'imbel'],
  // ROSSI (Brasil)
  ['Rossi', 'RM64', 'R', '.357 Magnum', 'R', '6', '1', '', '', '', '', 'rossi'],
  ['Rossi', 'RS22P', 'P', '.22 LR', 'S', '10', '1', '152', '', '', '', 'rossi'],
  ['Rossi', 'Rio Bravo', 'C', '.22 WMR', 'R', '12', '1', '508', '', '', '', 'rossi'],
  ['Rossi', 'Rio Bravo Tactical', 'C', '.22 LR', 'R', '10', '1', '419', '', '', '', 'rossi'],
  ['Rossi', 'Brawler', 'P', '.45 Colt', 'T', '1', '1', '', '', '', '', 'rossi'],
  ['Rossi', 'SS Poly Tuffy', 'E', '36', 'T', '1', '1', '457', '', '', '', 'rossi'],
  ['Rossi', 'SS Poly Tuffy Turkey', 'E', '20', 'T', '1', '1', '660', '', '', '', 'rossi'],
  // BOITO / E.R. AMANTINO (Brasil)
  ['Boito', 'A680', 'E', '12', 'T', '2', '2', '508', '', '', '', 'boitoGm'],
  ['Boito', 'A680', 'E', '20', 'T', '2', '2', '', '', '', '', 'boito'],
  ['Boito', 'A680', 'E', '28', 'T', '2', '2', '', '', '', '', 'boito'],
  ['Boito', 'A680', 'E', '32', 'T', '2', '2', '', '', '', '', 'boito'],
  ['Boito', 'A680', 'E', '36', 'T', '2', '2', '', '', '', '', 'boito'],
  ['Boito', 'A681', 'E', '12', 'T', '2', '2', '', '', '', '', 'boito'],
  ['Boito', 'A681', 'E', '20', 'T', '2', '2', '', '', '', '', 'boito'],
  ['Boito', 'A681', 'E', '36', 'T', '2', '2', '', '', '', '', 'boito'],
  ['Boito', 'Miura I', 'E', '12', 'T', '2', '2', '', '', '', '', 'boito'],
  ['Boito', 'Miura I', 'E', '20', 'T', '2', '2', '', '', '', '', 'boito'],
  ['Boito', 'Miura I', 'E', '28', 'T', '2', '2', '', '', '', '', 'boito'],
  ['Boito', 'Miura I', 'E', '32', 'T', '2', '2', '', '', '', '', 'boito'],
  ['Boito', 'Miura I', 'E', '36', 'T', '2', '2', '', '', '', '', 'boito'],
  ['Boito', 'Miura II', 'E', '12', 'T', '2', '2', '711', '', '', '', 'boito'],
  ['Boito', 'Miura II', 'E', '20', 'T', '2', '2', '', '', '', '', 'boito'],
  ['Boito', 'Miura II', 'E', '28', 'T', '2', '2', '', '', '', '', 'boito'],
  ['Boito', 'Miura II', 'E', '32', 'T', '2', '2', '', '', '', '', 'boito'],
  ['Boito', 'Miura II', 'E', '36', 'T', '2', '2', '', '', '', '', 'boito'],
  ['Boito', 'ERA 2001', 'E', '12', 'T', '2', '2', '', '', '', '', 'boito'],
  ['Boito', 'Double Defense', 'E', '12', 'T', '2', '2', '', '', '', '', 'boito'],
  ['Boito', 'Double Defense', 'E', '20', 'T', '2', '2', '', '', '', '', 'boito'],
  ['Boito', 'Over Defense', 'E', '12', 'T', '2', '2', '', '', '', '', 'boito'],
  ['Boito', 'Over Defense', 'E', '20', 'T', '2', '2', '', '', '', '', 'boito'],
  ['Boito', 'Reuna', 'E', '12', 'T', '1', '1', '711', '', '', '', 'boitoGm'],
  ['Boito', 'Reuna', 'E', '20', 'T', '1', '1', '', '', '', '', 'boito'],
  ['Boito', 'Reuna', 'E', '28', 'T', '1', '1', '', '', '', '', 'boito'],
  ['Boito', 'Reuna', 'E', '32', 'T', '1', '1', '', '', '', '', 'boito'],
  ['Boito', 'Reuna', 'E', '36', 'T', '1', '1', '', '', '', '', 'boito'],
  ['Boito', 'B300', 'E', '28', 'T', '1', '1', '', '', '', '', 'boito'],
  ['Boito', 'B300', 'E', '32', 'T', '1', '1', '', '', '', '', 'boito'],
  ['Boito', 'B300', 'E', '36', 'T', '1', '1', '', '', '', '', 'boito'],
  // GLOCK (Áustria)
  ['Glock', 'G17', 'P', '9x19mm', 'S', '17', '1', '114', '', '', '', 'glock'],
  ['Glock', 'G17 Gen5', 'P', '9x19mm', 'S', '17', '1', '114', '', '', '', 'glock'],
  ['Glock', 'G19', 'P', '9x19mm', 'S', '15', '1', '102', '', '', '', 'glock'],
  ['Glock', 'G19 Gen5', 'P', '9x19mm', 'S', '15', '1', '102', '', '', '', 'glock'],
  ['Glock', 'G26 Gen5', 'P', '9x19mm', 'S', '10', '1', '87', '', '', '', 'glock'],
  ['Glock', 'G45', 'P', '9x19mm', 'S', '17', '1', '102', '', '', '', 'glock'],
  ['Glock', 'G22 Gen5', 'P', '.40 S&W', 'S', '15', '1', '114', '', '', '', 'glock'],
  ['Glock', 'G23 Gen5', 'P', '.40 S&W', 'S', '13', '1', '102', '', '', '', 'glock'],
  ['Glock', 'G25', 'P', '.380 ACP', 'S', '15', '1', '102', '', '', '', 'glock'],
  ['Glock', 'G28', 'P', '.380 ACP', 'S', '10', '1', '87', '', '', '', 'glock'],
  ['Glock', 'G42', 'P', '.380 ACP', 'S', '6', '1', '83', '', '', '', 'glock'],
  ['Glock', 'G44', 'P', '.22 LR', 'S', '10', '1', '102', '', '', '', 'glock'],
  // IWI (Israel)
  ['IWI', 'Jericho 941 F9', 'P', '9x19mm', 'S', '17', '1', '112', '', 'Direita', '', 'iwi'],
  ['IWI', 'Jericho 941 FS9', 'P', '9x19mm', 'S', '16', '1', '97', '', 'Direita', '', 'iwi'],
  ['IWI', 'Jericho 941 R9', 'P', '9x19mm', 'S', '16', '1', '112', '', 'Direita', '', 'iwi'],
  ['IWI', 'Jericho 941 RS9', 'P', '9x19mm', 'S', '16', '1', '97', '', 'Direita', '', 'iwi'],
  ['IWI', 'Masada', 'P', '9x19mm', 'S', '10/17', '1', '104', '', 'Direita', '', 'iwi'],
  ['IWI', 'Masada Tactical', 'P', '9x19mm', 'S', '10/17', '1', '117', '', 'Direita', '', 'iwi'],
  ['IWI', 'Masada Slim', 'P', '9x19mm', 'S', '10/13', '1', '86', '', 'Direita', '', 'iwi'],
  // BERSA (Argentina)
  ['Bersa', 'Thunder 380X', 'P', '.380 ACP', 'S', '8', '1', '108', '6', 'Direita', '', 'bersa'],
  ['Bersa', 'TPR9', 'P', '9x19mm', 'S', '17', '1', '108', '6', 'Direita', '', 'bersa'],
  // HATSAN (Turquia)
  ['Hatsan', 'Escort AS', 'E', '12', 'S', '4', '1', '610 a 711', '', '', '', 'hatsan'],
  ['Hatsan', 'Escort AS', 'E', '20', 'S', '4', '1', '559 a 711', '', '', '', 'hatsan'],
  ['Hatsan', 'Escort PS', 'E', '12', 'S', '4', '1', '610 a 711', '', '', '', 'hatsan'],
  ['Hatsan', 'Escort PS', 'E', '20', 'S', '4', '1', '610 a 711', '', '', '', 'hatsan'],
  ['Hatsan', 'Escort MP', 'E', '12', 'R', '5 a 7', '1', '457 a 508', '', '', '', 'hatsan'],
  // CHARLES DALY
  ['Charles Daly', '202', 'E', '12', 'T', '2', '2', '711', '', '', '', 'cd'],
  ['Charles Daly', '202', 'E', '20', 'T', '2', '2', '660', '', '', '', 'cd'],
  ['Charles Daly', '202', 'E', '28', 'T', '2', '2', '660', '', '', '', 'cd'],
  ['Charles Daly', '202', 'E', '36', 'T', '2', '2', '660', '', '', '', 'cd'],
  // BENELLI (Itália) / RUGER (EUA)
  ['Benelli', 'Super Black Eagle 3', 'E', '12', 'S', '3', '1', '610 a 700', '', '', '', 'benelli'],
  ['Ruger', '10/22', 'C', '.22 LR', 'S', '10', '1', '', '', '', '', 'ruger'],
];
const _CAT_PAIS_MARCA = { Taurus: 'Brasil', CBC: 'Brasil', Imbel: 'Brasil', Rossi: 'Brasil', Boito: 'Brasil', Glock: 'Áustria', IWI: 'Israel', Bersa: 'Argentina', Hatsan: 'Turquia', Benelli: 'Itália', Ruger: 'Estados Unidos' };
const _CAT_ESP = { P: 'Pistola', R: 'Revólver', C: 'Carabina/Fuzil', E: 'Espingarda' };
const _CAT_FUN = { S: 'Semi-Automático', R: 'Repetição', T: 'Tiro-Simples' };

// ---------- Normalização ----------
function _catUp(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim(); }

// Marca com grafias diferentes ("FORJAS TAURUS", "Taurus Armas"...) vira um nome só
const _CAT_MARCAS = [
  [/TAURUS/, 'Taurus'], [/COMPANHIA BRASILEIRA|^CBC\b/, 'CBC'], [/BOITO|AMANTINO/, 'Boito'], [/ROSSI/, 'Rossi'],
  [/IMBEL|INDUSTRIA DE MATERIAL BELICO/, 'Imbel'], [/GLOCK/, 'Glock'], [/BERETTA/, 'Beretta'], [/SIG.?SAUER/, 'Sig Sauer'],
  [/\bIWI\b|ISRAEL WEAPON/, 'IWI'], [/BERSA/, 'Bersa'], [/HATSAN/, 'Hatsan'], [/KRAL/, 'Kral'], [/CHARLES DALY/, 'Charles Daly'],
  [/BENELLI/, 'Benelli'], [/WINCHESTER/, 'Winchester'], [/MOSSBERG/, 'Mossberg'], [/RUGER/, 'Ruger'], [/SPRINGFIELD/, 'Springfield Armory'],
  [/HUGLU/, 'Huglu'], [/ARMSAN/, 'Armsan'], [/TIKKA/, 'Tikka'], [/BROWNING/, 'Browning'], [/SMITH|S\s?&\s?W\b/, 'Smith & Wesson'],
  [/CZ\b|CESKA/, 'CZ'], [/STOEGER/, 'Stoeger'],
];
function marcaCanonica(m) {
  const u = _catUp(m);
  for (const [re, nome] of _CAT_MARCAS) if (re.test(u)) return nome;
  return String(m || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase());
}
// Modelo comparável: sem espaços/pontos/traços; Taurus "PT 92"/"RT 856" = "92"/"856"
function modeloChave(marca, modelo) {
  let u = _catUp(modelo).replace(/[^A-Z0-9]/g, '');
  if (marcaCanonica(marca) === 'Taurus') u = u.replace(/^(PT|RT)(?=\d)/, '');
  return u;
}

// Calibre "canônico" (para comparar ".380 ACP" com "380", "9mm" com "9x19" etc.)
function calibreChave(calibre, especie) {
  const u = _catUp(calibre).replace(/,/g, '.').replace(/^CAL(IBRE)?\.?\s*/, '').trim();
  if (!u) return '';
  const esp = _catUp(especie);
  if (/ESPINGARDA/.test(esp)) {
    if (/\.?410/.test(u)) return 'GA36';
    const g = u.match(/\b(10|12|16|20|24|28|32|36)\b/);
    if (g) return 'GA' + g[1];
  }
  const regras = [
    [/454/, '454'], [/44.?40/, '44-40'], [/45.?70/, '45-70'], [/38.?40/, '38-40'],
    [/44\s*(SPL|SPEC)/, '44SPL'], [/\.?44\b/, '44MAG'],
    [/\.?45\s*(COLT|LC|LONG)/, '45COLT'], [/\.?45\b/, '45ACP'],
    [/357/, '357'],
    [/380|9\s*X\s*17|9\s*MM\s*(CURTO|KURZ|SHORT)/, '380'],
    [/9\s*X\s*19|9\s*MM|\b9\s*(LUGER|PARA)|^9$/, '9MM'],
    [/10\s*MM/, '10MM'], [/\.?40\b/, '40'],
    [/\.?38\b/, '38SPL'],
    [/22.?250/, '22-250'], [/22\s*HORNET/, '22HORNET'], [/\.?22\s*(WMR|MAG|W\.?M\.?R)/, '22WMR'], [/\.?22\s*(SHORT|CURTO)/, '22SHORT'], [/\.?22\b/, '22LR'],
    [/17\s*HMR/, '17HMR'],
    [/308|7\.62\s*X\s*51/, '308'], [/30.?06/, '3006'], [/7\.62\s*X\s*39/, '76239'], [/223|5\.56/, '223'], [/243/, '243'], [/270/, '270'],
    [/6\.5\s*(CM|CREED)/, '65CM'], [/300\s*(WIN|WM)/, '300WM'],
    [/\.?32\s*(ACP|AUTO)|7\.65/, '32ACP'], [/\.?32/, /PISTOLA/.test(esp) ? '32ACP' : '32SW'],
    [/\.?25\s*(ACP|AUTO)|6\.35/, '25ACP'],
  ];
  for (const [re, k] of regras) if (re.test(u)) return k;
  return u.replace(/[^A-Z0-9]/g, '');
}

// Tipo da arma para a regra do decreto: curta | raiada | lisa  (+ semi-automática)
function _catTipo(especie, alma) {
  const e = _catUp(especie), a = _catUp(alma);
  if (/PISTOLA|REVOLVER/.test(e)) return 'curta';
  if (/ESPINGARDA/.test(e)) return 'lisa';
  if (/CARABINA|FUZIL|RIFLE/.test(e)) return 'raiada';
  if (/LISA/.test(a)) return 'lisa';
  if (/RAIADA/.test(a)) return 'raiada';
  return '';
}

// Regra do Decreto 11.615/2023 (arts. 11 e 12, com o Decreto 12.345/2024):
// - curtas: permitido até 407 J (.22, .25, .32, .380, .38 SPL); acima disso (9mm, .40, .45, .357...) restrito;
// - longas raiadas de repetição: permitido até 1.620 J; semiautomáticas só até o .22 LR;
// - longas de alma lisa: permitido calibre 12 ou menor, desde que não seja semiautomática.
const _CAT_CURTA_PERM = new Set(['22SHORT', '22LR', '22WMR', '17HMR', '25ACP', '32ACP', '32SW', '380', '38SPL']);
const _CAT_CURTA_REST = new Set(['9MM', '40', '10MM', '45ACP', '45COLT', '357', '44SPL', '44MAG', '454', '44-40', '38-40', '45-70']);
const _CAT_LONGA_PERM = new Set(['22SHORT', '22LR', '22WMR', '17HMR', '22HORNET', '25ACP', '32ACP', '32SW', '380', '38SPL', '357', '9MM', '40', '45ACP', '45COLT', '44SPL', '44-40', '38-40', '44MAG']);
const _CAT_LONGA_REST = new Set(['454', '45-70', '308', '3006', '76239', '223', '243', '270', '65CM', '300WM', '22-250', '10MM']);
function grupoPelaRegra(especie, calibre, funcionamento, alma) {
  const tipo = _catTipo(especie, alma);
  const semi = /SEMI|AUTOMAT/.test(_catUp(funcionamento));
  // calibre com várias opções (ex.: ".454 Casull / .45 Colt / .410"): vale o mais forte
  const chaves = String(calibre || '').split('/').map(c => calibreChave(c, especie)).filter(Boolean);
  if (!tipo || !chaves.length) return '';
  const um = (k) => {
    if (tipo === 'curta') return _CAT_CURTA_PERM.has(k) ? 'Permitido' : (_CAT_CURTA_REST.has(k) ? 'Restrito' : '');
    if (tipo === 'raiada') {
      if (semi) return (k === '22LR' || k === '22SHORT') ? 'Permitido' : 'Restrito';
      return _CAT_LONGA_PERM.has(k) ? 'Permitido' : (_CAT_LONGA_REST.has(k) ? 'Restrito' : '');
    }
    // alma lisa
    if (semi) return 'Restrito';
    const g = k.match(/^GA(\d+)$/);
    return g ? (Number(g[1]) >= 12 ? 'Permitido' : 'Restrito') : '';
  };
  const r = chaves.map(um);
  if (r.includes('Restrito')) return 'Restrito';
  return r.every(x => x === 'Permitido') ? 'Permitido' : '';
}

// ---------- Montagem do catálogo ----------
// Mesmos campos da bolinha verde "Dados completos" (só os que descrevem o modelo; acabamento fica de fora)
const CAT_CAMPOS_OBRIGATORIOS = ['Marca', 'Modelo', 'Especie', 'Calibre', 'GrupoCalibre', 'PaisFabricacao', 'CapacidadeTiro', 'NumeroCanos', 'AlmaCano', 'Funcionamento'];
const CAT_CAMPOS_MODELO = ['Marca', 'Modelo', 'Especie', 'Calibre', 'GrupoCalibre', 'PaisFabricacao', 'CapacidadeTiro', 'NumeroCanos', 'ComprimentoCano', 'AlmaCano', 'NumeroRaias', 'SentidoRaias', 'Funcionamento'];

function chaveCatalogo(a) {
  return [marcaCanonica(a.Marca), modeloChave(a.Marca, a.Modelo), calibreChave(a.Calibre, a.Especie)].join('|');
}

function montarCatalogoArmas(armas) {
  const grupos = {};
  (armas || []).forEach(a => {
    if (!a || CAT_CAMPOS_OBRIGATORIOS.some(c => !String(a[c] == null ? '' : a[c]).trim())) return;
    const k = chaveCatalogo(a);
    (grupos[k] = grupos[k] || []).push(a);
  });
  // Grupo (permitido/restrito) mais usado no sistema por calibre + tipo — serve para conferir os modelos da internet
  const votos = {};
  const lista = Object.entries(grupos).map(([k, regs]) => {
    // o cadastro mais completo do grupo representa o modelo
    const melhor = regs.slice().sort((x, y) => CAT_CAMPOS_MODELO.filter(c => y[c]).length - CAT_CAMPOS_MODELO.filter(c => x[c]).length)[0];
    const cont = {};
    regs.forEach(r => { cont[r.GrupoCalibre] = (cont[r.GrupoCalibre] || 0) + 1; });
    const grupo = Object.keys(cont).sort((x, y) => cont[y] - cont[x])[0];
    const item = { chave: k, origem: 'sistema', qtd: regs.length };
    CAT_CAMPOS_MODELO.forEach(c => { item[c] = melhor[c] == null ? '' : String(melhor[c]); });
    item.Marca = marcaCanonica(melhor.Marca);
    item.GrupoCalibre = grupo;
    regs.forEach(r => {
      const vk = calibreChave(r.Calibre, r.Especie) + '|' + _catTipo(r.Especie, r.AlmaCano) + '|' + (/SEMI/.test(_catUp(r.Funcionamento)) ? 's' : 'r');
      (votos[vk] = votos[vk] || {})[r.GrupoCalibre] = ((votos[vk] || {})[r.GrupoCalibre] || 0) + 1;
    });
    return item;
  });
  const chavesSistema = new Set(lista.map(i => i.chave));
  CATALOGO_ARMAS_INTERNET.forEach(r => {
    const [marca, modelo, esp, calibre, fun, cap, canos, compr, raias, sentido, pais, fonte] = r;
    const item = {
      origem: 'internet', qtd: 0,
      Marca: marca, Modelo: modelo, Especie: _CAT_ESP[esp] || esp, Calibre: calibre, Funcionamento: _CAT_FUN[fun] || fun,
      CapacidadeTiro: cap, NumeroCanos: canos, ComprimentoCano: compr, AlmaCano: esp === 'E' ? 'Lisa' : 'Raiada',
      NumeroRaias: raias, SentidoRaias: sentido, PaisFabricacao: pais || _CAT_PAIS_MARCA[marca] || '',
      fonte: _CAT_FONTES[fonte] || fonte,
    };
    item.chave = chaveCatalogo(item);
    if (chavesSistema.has(item.chave)) return;            // já existe no sistema: vale o cadastro do sistema
    // Permitido/restrito: primeiro o que o sistema já usa para esse calibre e tipo de arma; senão, a regra do decreto
    const vk = calibreChave(String(calibre).split('/')[0], item.Especie) + '|' + _catTipo(item.Especie, item.AlmaCano) + '|' + (fun === 'S' ? 's' : 'r');
    const v = votos[vk];
    const doSistema = v && Object.keys(v).sort((x, y) => v[y] - v[x])[0];
    const pelaRegra = grupoPelaRegra(item.Especie, calibre, item.Funcionamento, item.AlmaCano);
    item.GrupoCalibre = (String(calibre).includes('/') ? pelaRegra : (doSistema || pelaRegra)) || '';
    item.grupoComo = doSistema && !String(calibre).includes('/') ? 'sistema' : 'regra';
    if (!item.GrupoCalibre || !item.CapacidadeTiro) return;   // sem os dados principais: não entra
    chavesSistema.add(item.chave);
    lista.push(item);
  });
  return lista.sort((x, y) => x.Marca.localeCompare(y.Marca, 'pt-BR') || x.Modelo.localeCompare(y.Modelo, 'pt-BR', { numeric: true }) || x.Calibre.localeCompare(y.Calibre, 'pt-BR'));
}

// ---------- Janela do catálogo ----------
window._catArmas = { lista: [], sel: new Set(), filtro: { texto: '', especie: '', grupo: '', origem: '' } };

function _catBadgeOrigem(it) {
  return it.origem === 'sistema'
    ? `<span class="badge" style="background:#dbeafe;color:#1d4ed8" title="Informação dos cadastros do Gestão${it.qtd ? ` (${it.qtd} arma(s) cadastrada(s))` : ''}"><i class="bi bi-database-fill"></i> Sistema</span>`
    : `<span class="badge" style="background:#f3e8ff;color:#7e22ce" title="Informação do catálogo do fabricante na internet"><i class="bi bi-globe2"></i> Internet</span>`;
}
function _catBadgeGrupo(g) {
  return g === 'Restrito' ? '<span class="badge badge-red">Restrito</span>' : (g === 'Permitido' ? '<span class="badge badge-green">Permitido</span>' : '<span class="badge">—</span>');
}

async function abrirCatalogoArmas() {
  document.getElementById('modal-catalogo-armas')?.remove();
  const modal = document.createElement('div');
  modal.id = 'modal-catalogo-armas';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:12px';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `<div style="background:#fff;border-radius:14px;width:100%;max-width:1100px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden">
    <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--border);flex-wrap:wrap">
      <img src="iconecatalogo.png" alt="" style="width:30px;height:auto" />
      <h3 style="margin:0;font-size:16px;flex:1;min-width:160px">Catálogo de Armas <span id="cat-total" style="font-size:12px;color:var(--text-muted);font-weight:400"></span></h3>
      <button class="btn btn-primary btn-sm" onclick="_catAbrirVerificacao()"><i class="bi bi-person-check"></i> Verificar acervo do cliente</button>
      <button onclick="document.getElementById('modal-catalogo-armas').remove()" style="background:none;border:none;cursor:pointer;font-size:24px;color:#666;line-height:1" title="Fechar">×</button>
    </div>
    <div id="cat-corpo" style="padding:14px 18px;overflow:auto;flex:1"><div class="empty-state"><div class="spinner"></div><p>Montando o catálogo...</p></div></div>
  </div>`;
  document.body.appendChild(modal);
  try {
    const armas = await App.getArmas();
    window._catArmas.lista = montarCatalogoArmas(armas);
    window._catArmas.sel = new Set();
  } catch (e) {
    document.getElementById('cat-corpo').innerHTML = `<div class="empty-state"><i class="bi bi-exclamation-triangle"></i><p>${esc(e.message || 'Erro ao carregar as armas.')}</p></div>`;
    return;
  }
  _catRenderLista();
}

function _catFiltrados() {
  const { lista, filtro } = window._catArmas;
  const termos = _catUp(filtro.texto).split(/\s+/).filter(Boolean);
  return lista.filter(it => {
    if (filtro.especie && it.Especie !== filtro.especie) return false;
    if (filtro.grupo && it.GrupoCalibre !== filtro.grupo) return false;
    if (filtro.origem && it.origem !== filtro.origem) return false;
    if (!termos.length) return true;
    const alvo = _catUp([it.Marca, it.Modelo, it.Especie, it.Calibre, it.GrupoCalibre, it.Funcionamento, it.CapacidadeTiro + ' tiros', it.PaisFabricacao, it.AlmaCano, it.origem === 'sistema' ? 'sistema' : 'internet'].join(' '));
    const alvoSemPont = alvo.replace(/[^A-Z0-9 ]/g, '');
    return termos.every(t => alvo.includes(t) || alvoSemPont.includes(t.replace(/[^A-Z0-9]/g, '')));
  });
}

function _catRenderLista() {
  const corpo = document.getElementById('cat-corpo');
  if (!corpo) return;
  const f = window._catArmas.filtro;
  const opt = (v, atual, rot) => `<option value="${v}" ${v === atual ? 'selected' : ''}>${rot || v || 'Todas'}</option>`;
  corpo.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
      <div style="position:relative;flex:1;min-width:220px">
        <i class="bi bi-search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted)"></i>
        <input id="cat-busca" type="search" placeholder="Buscar por marca, modelo, calibre, permitido/restrito, capacidade, funcionamento..." value="${esc(f.texto)}" oninput="window._catArmas.filtro.texto=this.value;_catRenderTabela()" style="width:100%;padding-left:32px" />
      </div>
      <select style="width:auto;flex:0 0 auto" onchange="window._catArmas.filtro.especie=this.value;_catRenderTabela()" title="Espécie">${opt('', f.especie, 'Todas as espécies')}${['Pistola', 'Revólver', 'Carabina/Fuzil', 'Espingarda'].map(e => opt(e, f.especie)).join('')}</select>
      <select style="width:auto;flex:0 0 auto" onchange="window._catArmas.filtro.grupo=this.value;_catRenderTabela()" title="Grupo do calibre">${opt('', f.grupo, 'Permitido e restrito')}${opt('Permitido', f.grupo)}${opt('Restrito', f.grupo)}</select>
      <select style="width:auto;flex:0 0 auto" onchange="window._catArmas.filtro.origem=this.value;_catRenderTabela()" title="Origem da informação">${opt('', f.origem, 'Sistema e internet')}${opt('sistema', f.origem, 'Só do sistema')}${opt('internet', f.origem, 'Só da internet')}</select>
    </div>
    <div id="cat-sel-info" style="font-size:12px;color:var(--text-muted);margin-bottom:8px"></div>
    <div id="cat-tabela"></div>
    <p style="font-size:11px;color:var(--text-muted);margin:10px 0 0">
      <i class="bi bi-info-circle"></i> Cada modelo aparece uma vez por calibre. Armas do sistema com dados incompletos (fora o acabamento) não entram.
      Nos modelos da internet, permitido/restrito segue o que o sistema já usa para o mesmo calibre e tipo de arma ou, se não houver, as regras do Decreto 11.615/2023 — confira sempre no CRAF.
    </p>`;
  _catRenderTabela();
}

function _catRenderTabela() {
  const box = document.getElementById('cat-tabela');
  if (!box) return;
  const itens = _catFiltrados();
  const { lista, sel } = window._catArmas;
  const nSis = lista.filter(i => i.origem === 'sistema').length;
  const tot = document.getElementById('cat-total');
  if (tot) tot.textContent = `— ${lista.length} modelo(s): ${nSis} do sistema, ${lista.length - nSis} da internet`;
  const info = document.getElementById('cat-sel-info');
  if (info) info.innerHTML = sel.size
    ? `<strong>${sel.size}</strong> arma(s) marcada(s) para verificar. <a href="javascript:void 0" onclick="_catAbrirVerificacao()">Verificar acervo do cliente →</a> · <a href="javascript:void 0" onclick="window._catArmas.sel.clear();_catRenderTabela()">limpar</a>`
    : 'Marque as armas na primeira coluna para verificar em qual acervo o cliente pode cadastrá-las.';
  if (!itens.length) { box.innerHTML = `<div class="empty-state" style="padding:24px"><i class="bi bi-search"></i><p>Nenhuma arma encontrada.</p></div>`; return; }
  const MAX = 400;
  box.innerHTML = `<div class="table-wrapper"><table>
    <thead><tr><th style="width:28px"></th><th>Marca / Modelo</th><th>Espécie</th><th>Calibre</th><th>Grupo</th><th>Capacidade</th><th>Funcionamento</th><th>Origem</th><th></th></tr></thead>
    <tbody>${itens.slice(0, MAX).map(it => {
      const idx = lista.indexOf(it);
      return `<tr style="cursor:pointer" onclick="if(event.target.type!=='checkbox')_catVerDetalhe(${idx})">
        <td><input type="checkbox" ${sel.has(idx) ? 'checked' : ''} onclick="event.stopPropagation();this.checked?window._catArmas.sel.add(${idx}):window._catArmas.sel.delete(${idx});_catRenderTabela()" title="Marcar para verificar acervo" /></td>
        <td><strong>${esc(it.Marca)}</strong> ${esc(it.Modelo)}</td>
        <td>${esc(it.Especie)}</td>
        <td style="white-space:nowrap">${esc(it.Calibre)}</td>
        <td>${_catBadgeGrupo(it.GrupoCalibre)}</td>
        <td>${esc(it.CapacidadeTiro)} tiro(s)</td>
        <td>${esc(it.Funcionamento)}</td>
        <td>${_catBadgeOrigem(it)}</td>
        <td><button class="btn btn-outline btn-sm" title="Ver ficha" onclick="event.stopPropagation();_catVerDetalhe(${idx})"><i class="bi bi-eye"></i></button></td>
      </tr>`;
    }).join('')}</tbody></table></div>
    ${itens.length > MAX ? `<p style="font-size:12px;color:var(--text-muted)">Mostrando ${MAX} de ${itens.length}. Use a busca para refinar.</p>` : ''}`;
}

function _catVerDetalhe(idx) {
  const it = window._catArmas.lista[idx];
  if (!it) return;
  document.getElementById('modal-cat-detalhe')?.remove();
  const row = (label, val, extra) => `<div class="info-item"><label>${label}</label><div class="value">${val ? esc(String(val)) : '<span style="color:var(--text-muted)">—</span>'}${extra || ''}</div></div>`;
  const notaGrupo = it.origem === 'internet'
    ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${it.grupoComo === 'sistema' ? 'Pelo que o sistema já usa para este calibre e tipo de arma' : 'Calculado pelas regras do Decreto 11.615/2023'}</div>` : '';
  const m = document.createElement('div');
  m.id = 'modal-cat-detalhe';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  m.innerHTML = `<div style="background:#fff;border-radius:12px;padding:22px;max-width:640px;width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.25)">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px">
      <h3 style="margin:0;font-size:16px"><i class="bi bi-shield-fill me-2"></i>${esc(it.Marca)} ${esc(it.Modelo)}</h3>
      <button onclick="document.getElementById('modal-cat-detalhe').remove()" style="background:none;border:none;cursor:pointer;font-size:22px;color:#666;line-height:1">×</button>
    </div>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      ${_catBadgeOrigem(it)} ${_catBadgeGrupo(it.GrupoCalibre)}
      ${it.origem === 'sistema' ? `<span style="font-size:12px;color:var(--text-muted)">${it.qtd} arma(s) deste modelo cadastrada(s) no Gestão</span>` : ''}
      ${it.fonte ? `<a href="${esc(it.fonte)}" target="_blank" rel="noopener" style="font-size:12px"><i class="bi bi-box-arrow-up-right"></i> Fonte</a>` : ''}
    </div>
    <div class="info-grid">
      ${row('Marca', it.Marca)}${row('Modelo', it.Modelo)}${row('Espécie', it.Especie)}${row('Calibre', it.Calibre)}
      ${row('Grupo Calibre', it.GrupoCalibre, notaGrupo)}${row('País de Fabricação', it.PaisFabricacao)}
      ${row('Capacidade de Tiro', it.CapacidadeTiro)}${row('N° de Canos', it.NumeroCanos)}${row('Comprimento do Cano (mm)', it.ComprimentoCano)}
      ${row('Alma do Cano', it.AlmaCano)}${row('N° de Raias', it.NumeroRaias)}${row('Sentido das Raias', it.SentidoRaias)}${row('Funcionamento', it.Funcionamento)}
    </div>
    <div style="margin-top:16px;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" onclick="window._catArmas.sel.add(${idx});document.getElementById('modal-cat-detalhe').remove();_catAbrirVerificacao()"><i class="bi bi-person-check"></i> Verificar para um cliente</button>
      <button class="btn btn-outline btn-sm" onclick="document.getElementById('modal-cat-detalhe').remove()">Fechar</button>
    </div>
  </div>`;
  document.body.appendChild(m);
}

// ---------- Verificar acervo do cliente ----------
async function _catAbrirVerificacao() {
  const corpo = document.getElementById('cat-corpo');
  if (!corpo) return;
  let clientes = [];
  try { clientes = (await App.getClientes()).filter(c => !isClienteInativo(c)); } catch (e) {}
  window._catArmas.clientes = clientes;
  const sel = [...window._catArmas.sel];
  corpo.innerHTML = `
    <button class="btn btn-ghost btn-sm" onclick="_catRenderLista()" style="margin-bottom:10px"><i class="bi bi-arrow-left"></i> Voltar ao catálogo</button>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">
      <div>
        <label style="font-weight:600;font-size:13px">1. Cliente</label>
        <input id="cat-ver-cliente" list="cat-ver-clientes" placeholder="Digite o nome do cliente" style="width:100%" autocomplete="off" />
        <datalist id="cat-ver-clientes">${clientes.map(c => `<option value="${esc(c.Title || '')}"></option>`).join('')}</datalist>
      </div>
      <div>
        <label style="font-weight:600;font-size:13px">2. Armas a verificar</label>
        <input id="cat-ver-busca" type="search" placeholder="Buscar arma no catálogo para adicionar" oninput="_catVerSugestoes(this.value)" style="width:100%" autocomplete="off" />
        <div id="cat-ver-sug" style="max-height:180px;overflow:auto"></div>
        <div id="cat-ver-sel" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px"></div>
      </div>
    </div>
    <div style="margin-top:12px"><button class="btn btn-primary" onclick="_catVerificar()"><i class="bi bi-check2-circle"></i> Verificar</button></div>
    <div id="cat-ver-resultado" style="margin-top:16px"></div>`;
  _catVerRenderSel();
  document.getElementById('cat-ver-cliente')?.focus();
  if (!sel.length) document.getElementById('cat-ver-resultado').innerHTML = '';
}

function _catVerSugestoes(txt) {
  const box = document.getElementById('cat-ver-sug');
  if (!box) return;
  const termos = _catUp(txt).split(/\s+/).filter(Boolean);
  if (!termos.length) { box.innerHTML = ''; return; }
  const { lista, sel } = window._catArmas;
  const achados = lista.map((it, i) => [it, i]).filter(([it, i]) => !sel.has(i) && termos.every(t => _catUp(`${it.Marca} ${it.Modelo} ${it.Calibre} ${it.Especie}`).includes(t))).slice(0, 12);
  box.innerHTML = achados.length
    ? achados.map(([it, i]) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding:5px 6px;border-bottom:1px solid var(--border);font-size:12.5px">
        <span><strong>${esc(it.Marca)}</strong> ${esc(it.Modelo)} — ${esc(it.Calibre)} ${_catBadgeGrupo(it.GrupoCalibre)}</span>
        <button class="btn btn-outline btn-sm" onclick="window._catArmas.sel.add(${i});_catVerRenderSel();_catVerSugestoes(document.getElementById('cat-ver-busca').value)"><i class="bi bi-plus"></i></button></div>`).join('')
    : '<div style="font-size:12px;color:var(--text-muted);padding:6px">Nenhuma arma encontrada.</div>';
}

function _catVerRenderSel() {
  const box = document.getElementById('cat-ver-sel');
  if (!box) return;
  const { lista, sel } = window._catArmas;
  box.innerHTML = sel.size
    ? [...sel].map(i => { const it = lista[i]; return `<span style="background:#f1f5f9;border:1px solid var(--border);border-radius:999px;padding:3px 6px 3px 10px;font-size:12px;display:inline-flex;align-items:center;gap:4px">
        ${esc(it.Marca)} ${esc(it.Modelo)} (${esc(it.Calibre)}) ${_catBadgeGrupo(it.GrupoCalibre)}
        <button onclick="window._catArmas.sel.delete(${i});_catVerRenderSel()" style="background:none;border:none;cursor:pointer;color:#666;font-size:14px;line-height:1" title="Tirar">×</button></span>`; }).join('')
    : '<span style="font-size:12px;color:var(--text-muted)">Nenhuma arma escolhida ainda.</span>';
}

// Regras e limites de cada acervo para um cliente + lista de armas novas (cada uma com GrupoCalibre)
function verificarAcervosCliente(cliente, armasCliente, novas) {
  const cats = (cliente.Categoria || '').split(',').map(c => c.trim());
  const ehRes = a => a.GrupoCalibre === 'Restrito';
  const nRes = novas.filter(ehRes).length;
  const semGrupo = novas.filter(a => !a.GrupoCalibre).length;
  const res = [];
  const montar = (acervo, temAtividade, atuais, limTotal, limRes, motivoSemAtividade, extras) => {
    const atuaisRes = atuais.filter(ehRes).length;
    const depoisTotal = atuais.length + novas.length;
    const depoisRes = atuaisRes + nRes;
    const problemas = [];
    if (!temAtividade) problemas.push(motivoSemAtividade);
    if (semGrupo) problemas.push(`${semGrupo} arma(s) sem grupo de calibre definido`);
    if (depoisTotal > limTotal) problemas.push(`passa do limite de ${limTotal} arma(s): tem ${atuais.length} + ${novas.length} nova(s) = ${depoisTotal}`);
    if (nRes && !limRes) problemas.push('este acervo não aceita calibre restrito');
    else if (nRes && depoisRes > limRes) problemas.push(`passa do limite de ${limRes} de calibre restrito: tem ${atuaisRes} + ${nRes} nova(s) = ${depoisRes}`);
    const vagas = Math.max(0, limTotal - atuais.length);
    const vagasRes = Math.max(0, Math.min(limRes - atuaisRes, vagas));
    res.push({ acervo, pode: !problemas.length, problemas, atual: atuais.length, atualRes: atuaisRes, limTotal, limRes, vagas, vagasRes, extras: extras || [] });
  };
  // Atirador desportivo — por nível
  const nivel = cliente.NivelAtirador || 'I';
  const la = LIMITES_ATIRADOR[nivel] || LIMITES_ATIRADOR.I;
  montar(`Atirador (Nível ${nivel})`, cats.includes('Atirador'),
    armasCliente.filter(a => a.AtividadeCadastrada === 'Atirador'),
    (la.permitido || 0) + (la.restrito || 0), la.restrito || 0,
    'cliente não tem a atividade de Atirador cadastrada',
    nivel !== 'III' ? ['Calibre restrito só é aceito no Nível III.'] : []);
  // Caçador excepcional
  montar('Caçador', cats.includes('Caçador'),
    armasCliente.filter(a => a.AtividadeCadastrada === 'Caçador'),
    LIMITES_CACADOR.total, LIMITES_CACADOR.restrito,
    'cliente não tem a atividade de Caçador cadastrada',
    ['As de calibre restrito precisam de autorização do Exército.']);
  // Defesa pessoal (Polícia Federal)
  montar('Defesa Pessoal (PF)', true,
    armasCliente.filter(a => a.OrgaoCadastro === 'PF - Defesa Pessoal'),
    LIMITES_DEFESA_PESSOAL.total, LIMITES_DEFESA_PESSOAL.restrito, '',
    ['Só calibre permitido; precisa comprovar a efetiva necessidade.']);
  return res;
}

async function _catVerificar() {
  const out = document.getElementById('cat-ver-resultado');
  const nome = (document.getElementById('cat-ver-cliente')?.value || '').trim();
  const { lista, sel } = window._catArmas;
  if (!nome) { toast('Digite o nome do cliente.', 'error'); return; }
  if (!sel.size) { toast('Escolha pelo menos uma arma.', 'error'); return; }
  const n = _catUp(nome);
  const clientes = window._catArmas.clientes || [];
  const cliente = clientes.find(c => _catUp(c.Title) === n) || (clientes.filter(c => _catUp(c.Title).includes(n)).length === 1 ? clientes.find(c => _catUp(c.Title).includes(n)) : null);
  if (!cliente) { toast('Cliente não encontrado. Escolha um nome da lista.', 'error'); return; }
  out.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';
  let armasCliente = [];
  try { armasCliente = (await App.getArmas()).filter(a => String(a.ClienteId) === String(cliente.id)); } catch (e) { out.innerHTML = `<p style="color:var(--danger)">${esc(e.message)}</p>`; return; }
  const novas = [...sel].map(i => lista[i]);
  const juntas = verificarAcervosCliente(cliente, armasCliente, novas);
  const porArma = novas.map(a => verificarAcervosCliente(cliente, armasCliente, [a]));
  const corOk = '#16a34a', corNao = '#dc2626';
  const cards = juntas.map(r => `<div class="card" style="margin:0;border-top:4px solid ${r.pode ? corOk : corNao}">
    <div class="card-body" style="padding:12px 14px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">
        <strong style="font-size:14px">${esc(r.acervo)}</strong>
        <span class="badge" style="background:${r.pode ? '#dcfce7' : '#fee2e2'};color:${r.pode ? corOk : corNao}">${r.pode ? '<i class="bi bi-check-circle-fill"></i> Pode cadastrar' : '<i class="bi bi-x-circle-fill"></i> Não pode'}</span>
      </div>
      <div style="font-size:12px;color:#374151">Hoje: <strong>${r.atual}</strong> de ${r.limTotal} arma(s) · ${r.limRes ? `restrito: <strong>${r.atualRes}</strong> de ${r.limRes}` : `não aceita restrito${r.atualRes ? ` <span style="color:#b45309">(já tem ${r.atualRes} restrita(s) cadastrada(s))</span>` : ''}`}</div>
      <div style="font-size:12px;color:#374151">Vagas livres: <strong>${r.vagas}</strong>${r.limRes ? ` (até ${r.vagasRes} de calibre restrito)` : ' (só calibre permitido)'}</div>
      ${r.problemas.length ? `<ul style="margin:6px 0 0 16px;padding:0;font-size:12px;color:${corNao}">${r.problemas.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      ${r.extras.map(x => `<div style="font-size:11px;color:var(--text-muted);margin-top:4px"><i class="bi bi-info-circle"></i> ${esc(x)}</div>`).join('')}
    </div></div>`).join('');
  const tabela = novas.length > 1 ? `<h4 style="font-size:13px;margin:16px 0 6px">Arma por arma (cada uma sozinha)</h4>
    <div class="table-wrapper"><table><thead><tr><th>Arma</th>${juntas.map(r => `<th style="text-align:center">${esc(r.acervo)}</th>`).join('')}</tr></thead>
    <tbody>${novas.map((a, k) => `<tr><td>${esc(a.Marca)} ${esc(a.Modelo)} (${esc(a.Calibre)}) ${_catBadgeGrupo(a.GrupoCalibre)}</td>${porArma[k].map(r => `<td style="text-align:center" title="${esc(r.problemas.join('; '))}">${r.pode ? `<i class="bi bi-check-circle-fill" style="color:${corOk}"></i>` : `<i class="bi bi-x-circle-fill" style="color:${corNao}"></i>`}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
  out.innerHTML = `<h4 style="font-size:14px;margin:0 0 8px">${esc(cliente.Title)} — ${novas.length > 1 ? `as ${novas.length} armas juntas` : 'resultado'}</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">${cards}</div>${tabela}
    <p style="font-size:11px;color:var(--text-muted);margin-top:10px"><i class="bi bi-info-circle"></i> Limites do Decreto 11.615/2023: Atirador Nível I até 4 e Nível II até 8 (só permitido), Nível III até 16 (até 4 restritas); Caçador até 6 (até 2 restritas); Defesa Pessoal até 2 (só permitido). Conta as armas já cadastradas no Gestão em cada acervo.</p>`;
}
