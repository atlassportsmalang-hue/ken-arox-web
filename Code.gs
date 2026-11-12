/** KEN AROX — Jersey selections in H (participant 1) and I (participant 2). */
const SPREADSHEET_ID = '163cjAL5xD_xk1Rb1SsVrNHE8YH1xv0CdswAJLya8BAE';
const SHEET_GID = 1023882976;
const JERSEY_SIZES = ['S', 'M', 'L', 'XL'];
const JERSEY_LIMIT = 50;

function doGet() {
  return json_({ ok: true, service: 'KEN AROX jersey selector', columns: ['H', 'I'] });
}

function doPost(e) {
  const athlete = normalizeName_(e && e.parameter && e.parameter.athlete);
  const size = String((e && e.parameter && e.parameter.size) || '').trim().toUpperCase();
  if (!athlete || JERSEY_SIZES.indexOf(size) < 0) {
    return json_({ ok: false, message: 'Nama atlet atau ukuran tidak valid.' });
  }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheets().find(s => s.getSheetId() === SHEET_GID);
    if (!sheet) throw new Error('Tab spreadsheet peserta tidak ditemukan.');
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error('Data peserta belum tersedia.');
    // C:I = category, participant 1, participant 2, WhatsApp, institution, jersey 1, jersey 2
    const data = sheet.getRange(2, 3, lastRow - 1, 7).getDisplayValues();
    const assignments = new Map();
    const matchingCells = [];
    data.forEach((row, i) => {
      const category = String(row[0] || '').trim().toUpperCase();
      const single = category.startsWith('SINGLE');
      const names = [normalizeName_(row[1]), single ? '' : normalizeName_(row[2])];
      const sizes = [String(row[5] || '').trim().toUpperCase(), String(row[6] || '').trim().toUpperCase()];
      names.forEach((name, slot) => {
        if (!name) return;
        if (JERSEY_SIZES.includes(sizes[slot]) && !assignments.has(name)) assignments.set(name, sizes[slot]);
        if (name === athlete) matchingCells.push({ row: i + 2, col: slot === 0 ? 8 : 9 });
      });
    });
    if (!matchingCells.length) throw new Error('Nama atlet tidak ditemukan pada spreadsheet.');
    let count = 0;
    assignments.forEach((assigned, name) => { if (assigned === size && name !== athlete) count++; });
    if (count >= JERSEY_LIMIT) return json_({ ok: false, message: 'Ukuran ' + size + ' sudah habis.' });
    matchingCells.forEach(cell => sheet.getRange(cell.row, cell.col).setValue(size));
    SpreadsheetApp.flush();
    return json_({ ok: true, athlete, size, cellsUpdated: matchingCells.length });
  } catch (err) {
    return json_({ ok: false, message: err.message || 'Gagal menyimpan ukuran jersey.' });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

function normalizeName_(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
