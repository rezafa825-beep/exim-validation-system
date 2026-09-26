import * as XLSX from 'xlsx';

export async function readExcelFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, raw: true });
  return {
    name: file.name,
    workbook,
    sheets: workbook.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: '' }) }))
  };
}

export function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

export function normCompany(value) {
  return cleanText(value).toUpperCase().replace(/^PT\.?\s*/, '').trim();
}
export function normCode(value) { return cleanText(value).toUpperCase(); }
export function normName(value) { return cleanText(value).toUpperCase(); }

export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = cleanText(value).replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function findHeaderWithContinuation(rows, required = [], maxRows = 40, continuationRows = 2) {
  const wanted = required.map(x => cleanText(x).toUpperCase()).filter(Boolean);
  let best = { score: 0, row: -1, headers: {} };
  for (let r = 0; r < Math.min(rows.length, maxRows); r++) {
    const headers = {};
    for (let rr = r; rr <= Math.min(rows.length - 1, r + continuationRows); rr++) {
      (rows[rr] || []).forEach((v, c) => {
        const h = cleanText(v).toUpperCase();
        if (h && headers[h] === undefined) headers[h] = c;
      });
    }
    const score = wanted.filter(h => h in headers).length;
    if (score > best.score) best = { score, row: r, headers };
  }
  return best.row >= 0 ? best : null;
}

export function findHeader(rows, required = [], maxRows = 40) {
  const wanted = required.map(x => cleanText(x).toUpperCase()).filter(Boolean);
  let best = { score: 0, row: -1, headers: {} };
  for (let r = 0; r < Math.min(rows.length, maxRows); r++) {
    const headers = {};
    (rows[r] || []).forEach((v, c) => { const h = cleanText(v).toUpperCase(); if (h) headers[h] = c; });
    const score = wanted.filter(h => h in headers).length;
    if (score > best.score) best = { score, row: r, headers };
  }
  return best.row >= 0 ? best : null;
}


export function isHeaderLikeRow(row, headers = {}) {
  const values = (row || []).map(cleanText).filter(Boolean).map(v => v.toUpperCase());
  if (!values.length) return true;
  const headerSet = new Set(Object.keys(headers || {}).map(v => cleanText(v).toUpperCase()));
  const generic = new Set(['NO','NO.','ITEM NAME','MATERIAL CODE','ITEM CODE','PRODUCT CODE','SKU','STYLE','QTY','QUANTITY','UNIT','KEMASAN','GW','NW','GROSS WEIGHT','NET WEIGHT','WEIGHT','AMOUNT','AMOUNT (IDR)','SURAT JALAN']);
  const hits = values.filter(v => headerSet.has(v) || generic.has(v)).length;
  return hits >= 2;
}

export function resolveColumn(headers, mapping, field) {
  const target = mapping?.[field] || {};
  const candidates = [target.primary, ...(target.alternatives || [])].filter(Boolean);
  for (const candidate of candidates) {
    const key = cleanText(candidate).toUpperCase();
    if (headers[key] !== undefined) return headers[key];
  }
  for (const candidate of candidates) {
    const key = cleanText(candidate).toUpperCase();
    const qualified = Object.entries(headers).filter(([h]) => h.startsWith(key) && ['(', '-', ':', '/'].includes(h.slice(key.length).trimStart()[0]));
    if (qualified.length === 1) return qualified[0][1];
  }
  return null;
}

export function findInlineValue(rows, labels) {
  const wanted = labels.map(x => x.toUpperCase());
  for (const row of rows.slice(0, 25)) {
    for (let i = 0; i < row.length; i++) {
      const v = cleanText(row[i]);
      const up = v.toUpperCase();
      for (const label of wanted) {
        if (!up.startsWith(label)) continue;
        const rest = v.slice(label.length).replace(/^\s*[:#-]?\s*/, '');
        if (rest) return rest.match(/[A-Z0-9][A-Z0-9._/-]{3,}/i)?.[1] || rest;
        if (row[i + 1]) return cleanText(row[i + 1]);
      }
    }
  }
  return '';
}

export function extractParties(rows) {
  let sender = '';
  for (const row of rows.slice(0, 8)) {
    for (const cell of row) {
      const v = cleanText(cell);
      if (/^(PT\.?|CV\.?|UD\s)/i.test(v)) { sender = v.split('\n')[0].trim(); break; }
    }
    if (sender) break;
  }
  let receiver = '';
  const labels = ['CONSIGNEE', 'SHIP TO'];
  outer: for (let r = 0; r < Math.min(rows.length, 20); r++) {
    for (let c = 0; c < (rows[r] || []).length; c++) {
      const v = cleanText(rows[r][c]).toUpperCase();
      if (labels.some(label => v.startsWith(label) && !v.startsWith(`${label} ADDRESS`))) {
        const raw = cleanText(rows[r][c]);
        const after = raw.replace(/^(CONSIGNEE|SHIP TO)\s*[:#-]?\s*/i, '').trim();
        if (after) receiver = after.split('\n')[0];
        if (!receiver) {
          for (let cc = c + 1; cc < Math.min((rows[r] || []).length, c + 4); cc++) {
            if (cleanText(rows[r][cc])) { receiver = cleanText(rows[r][cc]).split('\n')[0]; break; }
          }
        }
        if (receiver) break outer;
      }
    }
  }
  return { company_sender: sender, company_receiver: receiver };
}

export function detectSheetType(rows, sheetName = '') {
  const text = rows.slice(0, 60).flat().map(cleanText).filter(Boolean).join(' | ').toUpperCase();
  const scores = { draft_exim: 0, packing_list: 0, invoice: 0, surat_jalan: 0, unknown: 0 };
  const names = sheetName.toUpperCase();
  if (['ENTITAS', 'DOKUMEN', 'BARANG'].every(x => text.includes(x))) scores.draft_exim += 100;
  if (['ENTITAS', 'DOKUMEN', 'BARANG'].every(x => names.includes(x))) scores.draft_exim += 1000;
  if (text.includes('PACKING LIST')) scores.packing_list += 30;
  if (['GW', 'NW', 'KEMASAN'].every(x => text.includes(x))) scores.packing_list += 15;
  if (text.includes('INVOICE') && text.includes('AMOUNT')) scores.invoice += 30;
  if (text.includes('SURAT JALAN')) scores.surat_jalan += 30;
  if (text.includes('ITEM NAME') && text.includes('QTY')) { scores.invoice += 5; scores.packing_list += 5; }
  const best = Object.entries(scores).filter(([k]) => k !== 'unknown').sort((a,b) => b[1]-a[1])[0];
  return { type: best?.[1] > 0 ? best[0] : 'unknown', scores };
}

export function detectWorkbook(fileData) {
  const docs = [];
  const allNames = new Set(fileData.sheets.map(s => s.name.toUpperCase()));
  if (['ENTITAS','DOKUMEN','BARANG'].every(x => allNames.has(x))) docs.push({ sheetName: '__WORKBOOK__', type: 'draft_exim', score: 1000 });
  for (const sheet of fileData.sheets) {
    const d = detectSheetType(sheet.rows, sheet.name);
    if (d.type !== 'unknown') docs.push({ sheetName: sheet.name, type: d.type, score: Math.max(...Object.values(d.scores)) });
  }
  return docs;
}
