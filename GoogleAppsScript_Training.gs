/**
 * ATLAS x KEN AROX — booking training (Google Apps Script)
 * Buat dari Google Sheet BARU: Extensions > Apps Script; paste file ini.
 * Deploy: Web app > Execute as: Me > Who has access: Anyone.
 * Spreadsheet tetap PRIVATE. Hanya counts (tanpa data pribadi) yang dibuka untuk publik.
 */
const TRAINING_SETTINGS = {
  SHEET_NAME: 'Training Booking',
  CAPACITY_PER_SLOT: 8, // Set 0 for unlimited; match training-config.js
  TZ: 'Asia/Jakarta',
  START: '2026-11-01',
  END: '2026-11-21',
  HEADERS: ['Waktu Daftar WIB','Request ID','Tanggal Training','Hari','Jam Mulai','Jam Selesai','Jenis Sesi','Nama Peserta','WhatsApp','Komunitas / Asal','Catatan','Status Admin','Waktu Verifikasi','Catatan Admin']
};

function setupTrainingSheet() {
  const sheet = sheet_();
  sheet.setFrozenRows(1);
  sheet.getRange(1,1,1,TRAINING_SETTINGS.HEADERS.length).setFontWeight('bold').setBackground('#f5d317');
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(['PENDING','APPROVED','REJECTED'],true).setAllowInvalid(false).build();
  sheet.getRange(2,12,Math.max(sheet.getMaxRows()-1,1),1).setDataValidation(rule);
  sheet.getRange('B:B').setNumberFormat('@');
  sheet.getRange('E:F').setNumberFormat('@');
  sheet.getRange('I:I').setNumberFormat('@');
  sheet.autoResizeColumns(1,14);
}

function sheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(TRAINING_SETTINGS.SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(TRAINING_SETTINGS.SHEET_NAME);
  if(sheet.getLastRow()===0) sheet.appendRow(TRAINING_SETTINGS.HEADERS);
  return sheet;
}
function clean_(v,max) {
  // Prevent spreadsheet formula injection and keep data plain text.
  let s=String(v===undefined?'':v).trim().slice(0,max).replace(/[\u0000-\u001f]/g,' ');
  if(/^[=+\-@]/.test(s)) s="'"+s;
  return s;
}
function validate_(p) {
  const date=String(p.date||''),time=String(p.time||''),type=String(p.type||'');
  if(!/^2026-11-\d{2}$/.test(date)||date<TRAINING_SETTINGS.START||date>TRAINING_SETTINGS.END) throw Error('Tanggal harus 1–21 November 2026.');
  if(!/^\d{2}:00$/.test(time)) throw Error('Format jam tidak valid.');
  const h=Number(time.slice(0,2));
  if(!Number.isInteger(h)||h<6||h>=20)throw Error('Sesi di luar jam training.');
  const dateObj=new Date(date+'T00:00:00Z');
  const day=dateObj.getUTCDay();
  if((day===0||day===6)&&h>=17)throw Error('Sesi akhir pekan 17.00–20.00 tidak tersedia.');
  if(type!==(h===10||h===15?'PAID':'FREE'))throw Error('Kategori sesi tidak sesuai.');
  const now=Utilities.formatDate(new Date(),TRAINING_SETTINGS.TZ,'yyyy-MM-dd HH:mm');
  if(date+' '+time<=now)throw Error('Sesi sudah berlalu.');
  const name=clean_(p.name,100),phone=String(p.phone||'').replace(/\D/g,'');
  if(name.length<2||phone.length<9||phone.length>15)throw Error('Nama atau nomor WhatsApp tidak valid.');
  const requestId=String(p.requestId||'').trim();
  if(!/^KA-[A-F0-9]{32}$/.test(requestId))throw Error('Nomor permintaan tidak valid.');
  return {date,time,type,h,name,phone,requestId,day,community:clean_(p.community,100),notes:clean_(p.notes,300)};
}
// Google Sheets can display 06:00 as 6:00 even when the user submits 06:00.
// Normalize all pre-existing rows before counting capacity or checking duplicates.
function normalizedTime_(value){
  const str=String(value==null?'':value).trim().replace('.',':');
  const match=str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  return match?String(Number(match[1])).padStart(2,'0')+':'+match[2]:str;
}
function normalizedDate_(value){
  const str=String(value==null?'':value).trim();
  // Booking date is written as ISO text; preserve existing ISO dates.
  return str;
}
function records_(){
  const s=sheet_();
  if(s.getLastRow()<2)return [];
  return s.getRange(2,1,s.getLastRow()-1,14).getDisplayValues().map(row=>{
    row[2]=normalizedDate_(row[2]);
    row[4]=normalizedTime_(row[4]);
    return row;
  });
}
function doGet(e){
  const p=(e&&e.parameter)||{};
  const callback=String(p.callback||'');
  if(!/^[a-zA-Z_$][\w$]{0,100}$/.test(callback))
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:'Callback diperlukan.'})).setMimeType(ContentService.MimeType.JSON);
  let result;
  try {
    if(p.action==='counts') {
      const counts={};
      records_().forEach(row=>{
        if(['PENDING','APPROVED'].includes(String(row[11]).trim().toUpperCase())) {
          const key=row[2]+'|'+row[4]; counts[key]=(counts[key]||0)+1;
        }
      });
      result={ok:true,capacity:TRAINING_SETTINGS.CAPACITY_PER_SLOT,counts};
    } else if(p.action==='status') {
      const code=String(p.code||'').trim().toUpperCase();
      if(!/^KA-[A-F0-9]{32}$/.test(code))throw Error('Kode booking tidak valid.');
      const row=records_().find(r=>r[1]===code);
      if(!row)throw Error('Kode booking tidak ditemukan.');
      const status=String(row[11]).trim().toUpperCase();
      result={ok:true,status:['PENDING','APPROVED','REJECTED'].includes(status)?status:'PENDING'};
      // Never return participant name, WhatsApp, dates, notes or other personal information.
    } else throw Error('Aksi tidak tersedia.');
  } catch(err) { result={ok:false,error:String(err.message||err)}; }
  return ContentService.createTextOutput(callback+'('+JSON.stringify(result).replace(/</g,'\\u003c')+');').setMimeType(ContentService.MimeType.JAVASCRIPT);
}
function doPost(e){
  const p=(e&&e.parameter)||{};
  let result;
  const lock=LockService.getScriptLock();
  try{
    lock.waitLock(15000);
    if(p.action!=='book')throw Error('Aksi tidak dikenal.');
    const b=validate_(p),s=sheet_(),rows=records_();
    const existing=rows.find(row=>row[1]===b.requestId);
    if(existing){result={ok:true,requestId:b.requestId};}
    else {
      const duplicate=rows.some(row=>row[2]===b.date&&row[4]===b.time&&row[8].replace(/\D/g,'')===b.phone&&String(row[11]).trim().toUpperCase()!=='REJECTED');
      if(duplicate)throw Error('Nomor WhatsApp ini sudah terdaftar untuk sesi tersebut.');
      const n=rows.filter(row=>row[2]===b.date&&row[4]===b.time&&['PENDING','APPROVED'].includes(String(row[11]).trim().toUpperCase())).length;
      if(TRAINING_SETTINGS.CAPACITY_PER_SLOT>0&&n>=TRAINING_SETTINGS.CAPACITY_PER_SLOT)throw Error('Kuota sesi penuh. Pilih jam lain.');
      s.appendRow([Utilities.formatDate(new Date(),TRAINING_SETTINGS.TZ,'yyyy-MM-dd HH:mm:ss'),b.requestId,b.date,['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][b.day],b.time,String(b.h+1).padStart(2,'0')+':00',b.type,b.name,b.phone,b.community,b.notes,'PENDING','','']);
      result={ok:true,requestId:b.requestId};
    }
  }catch(err){result={ok:false,error:String(err.message||err),requestId:String(p.requestId||'')};}
  finally {try{lock.releaseLock();}catch(_) {}}
  // Return HTML to hidden iframe, which signals the booking result to its parent page.
  const safe=JSON.stringify(Object.assign({source:'KENAROX_TRAINING'},result)).replace(/</g,'\\u003c').replace(/>/g,'\\u003e');
  const html='<!doctype html><meta charset="utf-8"><script>window.top.postMessage('+safe+',"*");<\/script>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Optional: create timestamp when admin manually edits status in column L. */
function onEdit(e){
  if(!e||e.range.getSheet().getName()!==TRAINING_SETTINGS.SHEET_NAME)return;
  if(e.range.getColumn()===12&&e.range.getRow()>1){
    const value=String(e.value||'').toUpperCase();
    if(['APPROVED','REJECTED'].includes(value))e.range.getSheet().getRange(e.range.getRow(),13).setValue(new Date());
  }
}
