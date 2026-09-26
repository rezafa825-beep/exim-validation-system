import { cleanText, toNumber, normCompany, findHeader, findHeaderWithContinuation, resolveColumn, findInlineValue, extractParties, isHeaderLikeRow } from './excelReader';

function getSheet(fileData, sheetName) {
  return fileData.sheets.find(s => s.name === sheetName);
}
function rowIsAggregation(value, labels) {
  return (labels || 'TOTAL;SUBTOTAL;GRAND TOTAL').split(';').map(x => x.trim().toUpperCase()).includes(cleanText(value).toUpperCase());
}

export function parseInvoice(fileData, mapping, sheetName) {
  const candidates = fileData.sheets.map(sheet => {
    const h = findHeader(sheet.rows, Object.values(mapping || {}).map(v => v.primary).concat(['ITEM NAME','QTY','AMOUNT']));
    return { sheet, h, score: h?.score || 0 };
  }).sort((a,b) => b.score-a.score);
  const chosen = sheetName ? { sheet: getSheet(fileData, sheetName), h: findHeader(getSheet(fileData, sheetName)?.rows || [], ['ITEM NAME','QTY','AMOUNT']) } : candidates[0];
  if (!chosen?.sheet || !chosen?.h) throw new Error('Header Invoice tidak ditemukan.');
  const { sheet, h } = chosen;
  const headers = h.headers;
  const cCode=resolveColumn(headers,mapping,'ITEM_CODE'), cName=resolveColumn(headers,mapping,'ITEM_NAME'), cQty=resolveColumn(headers,mapping,'QUANTITY'), cAmt=headers['AMOUNT']!==undefined?headers['AMOUNT']:resolveColumn(headers,mapping,'AMOUNT'), cAmtUsd=headers['AMOUNT']!==undefined?headers['AMOUNT']:null, cAmtIdr=headers['AMOUNT (IDR)']!==undefined?headers['AMOUNT (IDR)']:null, cSj=resolveColumn(headers,mapping,'SURAT_JALAN'), cInv=resolveColumn(headers,mapping,'INVOICE_NUMBER');
  const items=[]; let total=0, surat='', inv='';
  for (let r=h.row+1;r<sheet.rows.length;r++) {
    const row=sheet.rows[r]||[]; const name=cleanText(cName!==null?row[cName]:'');
    if (!name) continue;
    const qty=toNumber(cQty!==null?row[cQty]:null), amt=toNumber(cAmt!==null?row[cAmt]:null);
    const usd=toNumber(cAmtUsd!==null?row[cAmtUsd]:null), idr=toNumber(cAmtIdr!==null?row[cAmtIdr]:null);
    const headerText=cleanText(headers[cAmt]!==undefined?Object.keys(headers).find(k=>headers[k]===cAmt):'').toUpperCase();
    const currency=headerText.includes('IDR')||headerText.includes('RUPIAH')?'IDR':'USD';
    items.push({sequence:items.length+1,item_code:cleanText(cCode!==null?row[cCode]:''),item_name:name,quantity:qty,amount:amt,price:{value:amt,currency},prices:{USD:usd,IDR:idr},price_usd:usd,price_idr:idr});
    total += amt || 0;
    if (cSj!==null && cleanText(row[cSj])) surat=cleanText(row[cSj]);
    if (cInv!==null && cleanText(row[cInv])) inv=cleanText(row[cInv]);
  }
  if (!inv) inv=findInlineValue(sheet.rows,['INVOICE NO','INVOICE NUMBER']);
  if (!surat) surat=findInlineValue(sheet.rows,['SURAT JALAN','SURAT']);
  const totalCurrency = items[0]?.price?.currency || (String(mapping?.AMOUNT?.primary||'').toUpperCase().includes('IDR') ? 'IDR' : 'USD');
  const totalUsd = items.reduce((v,x)=>v+(x.price?.currency==='USD' ? (x.price?.value ?? 0) : 0),0);
  const totalIdr = items.reduce((v,x)=>v+(x.price?.currency==='IDR' ? (x.price?.value ?? 0) : 0),0);
  return {document_type:'invoice',invoice_no:inv,surat_jalan:surat,items,total_cif:total,total_cif_currency:totalCurrency,total_cif_by_currency:{USD:totalUsd,IDR:totalIdr},...extractParties(sheet.rows)};
}

export function parsePackingList(fileData, mapping, rowRule, sheetName) {
  const required = Object.values(mapping||{}).map(v=>v.primary).concat(['ITEM NAME','QTY','GW','NW','KEMASAN']);
  const candidates=fileData.sheets.map(sheet=>{
    const h=findHeaderWithContinuation(sheet.rows,required,40,2);
    const bonus=h?['KEMASAN','GW','NW','ITEM NAME','QTY'].filter(x=>h.headers[x]!==undefined).length*5:0;
    return {sheet,h,score:(h?.score||0)+bonus};
  }).sort((a,b)=>b.score-a.score);
  const chosen=sheetName?{sheet:getSheet(fileData,sheetName),h:findHeaderWithContinuation(getSheet(fileData,sheetName)?.rows||[],['ITEM NAME','QTY','GW','NW','KEMASAN'],40,2)}:candidates[0];
  if(!chosen?.sheet||!chosen?.h) throw new Error('Header Packing List tidak ditemukan.');
  const {sheet,h}=chosen; const headers={...h.headers};
  const cCode=resolveColumn(headers,mapping,'ITEM_CODE'),cName=resolveColumn(headers,mapping,'ITEM_NAME'),cQty=resolveColumn(headers,mapping,'QUANTITY'),cGw=resolveColumn(headers,mapping,'GROSS_WEIGHT'),cNw=resolveColumn(headers,mapping,'NET_WEIGHT'),cPkg=resolveColumn(headers,mapping,'PACKAGE'),cPl=resolveColumn(headers,mapping,'PACKING_LIST_NO');
  const items=[];let totalGw=0,totalNw=0,plno='',pkgType='',pkgQty=0;const labels=rowRule?.aggregation_labels||'TOTAL;SUBTOTAL;GRAND TOTAL';
  for(let r=h.row+1;r<sheet.rows.length;r++) { const row=sheet.rows[r]||[];const name=cleanText(cName!==null?row[cName]:'');if(!name||rowIsAggregation(name,labels)||isHeaderLikeRow(row,headers))continue;const qty=toNumber(cQty!==null?row[cQty]:null),gw=toNumber(cGw!==null?row[cGw]:null),nw=toNumber(cNw!==null?row[cNw]:null);const itemCode=cleanText(cCode!==null?row[cCode]:'');if(!itemCode && qty===null && gw===null && nw===null)continue;items.push({sequence:items.length+1,item_code:itemCode,item_name:name,quantity:qty,gross_weight:gw,net_weight:nw,package_value:cleanText(cPkg!==null?row[cPkg]:'' )});totalGw+=gw||0;totalNw+=nw||0;if(cPkg!==null){const raw=cleanText(row[cPkg]);const q=toNumber(raw);if(q!==null)pkgQty+=Math.trunc(q);}if(cPl!==null&&cleanText(row[cPl]))plno=cleanText(row[cPl]);}
  if(cPkg!==null){for(let rr=h.row+1;rr<=Math.min(sheet.rows.length-1,h.row+2);rr++){const raw=cleanText((sheet.rows[rr]||[])[cPkg]);if(raw&&toNumber(raw)===null&&!['KEMASAN','PACKAGE'].includes(raw.toUpperCase())){pkgType=raw;break;}}}
  if(!plno)plno=findInlineValue(sheet.rows,['PACKING LIST NO','PL NO','INVOICE NO']);
  return {document_type:'packing_list',packing_list_no:plno,items,total_gw:totalGw,total_nw:totalNw,package_type:pkgType,package_quantity:pkgQty,...extractParties(sheet.rows)};
}

export function parseSuratJalan(fileData, mapping = {}, sheetName) {
  const candidates = fileData.sheets.map(sheet => {
    const h = findHeader(sheet.rows, Object.values(mapping || {}).map(v => v.primary).concat(['ITEM NAME','QTY','KEMASAN']));
    return { sheet, h, score: h?.score || 0 };
  }).sort((a,b) => b.score-a.score);
  const chosen = sheetName
    ? { sheet: getSheet(fileData, sheetName), h: findHeader(getSheet(fileData, sheetName)?.rows || [], ['ITEM NAME','QTY','KEMASAN']) }
    : candidates[0];
  if (!chosen?.sheet || !chosen?.h) throw new Error('Header Surat Jalan tidak ditemukan.');
  const {sheet,h}=chosen;
  const headers=h.headers;
  const cCode=resolveColumn(headers,mapping,'ITEM_CODE');
  const cName=resolveColumn(headers,mapping,'ITEM_NAME');
  const cQty=resolveColumn(headers,mapping,'QUANTITY');
  const cPkg=resolveColumn(headers,mapping,'PACKAGE');
  const items=[]; let sj=''; let totalQty=0;
  for(let r=h.row+1;r<sheet.rows.length;r++){
    const row=sheet.rows[r]||[];
    const name=cleanText(cName!==null?row[cName]:'');
    if(!name || rowIsAggregation(name,'TOTAL;SUBTOTAL;GRAND TOTAL')) continue;
    const qty=toNumber(cQty!==null?row[cQty]:null);
    items.push({sequence:items.length+1,item_code:cleanText(cCode!==null?row[cCode]:''),item_name:name,quantity:qty});
    totalQty += qty || 0;
  }
  sj=findInlineValue(sheet.rows,['SURAT JALAN','NO SURAT JALAN','DELIVERY NO']);
  if(!sj){ const head=sheet.rows.slice(0,10).flat().map(cleanText).join(' | '); const m=head.match(/\b(?:CM|SJ)-\d{4}-\d{4,}\b/i); if(m) sj=m[0]; }
  return {document_type:'surat_jalan',surat_jalan:sj,items,total_quantity:totalQty,...extractParties(sheet.rows)};
}

export function parseDraft(fileData) {
  const ent=getSheet(fileData,'ENTITAS'),dok=getSheet(fileData,'DOKUMEN'),bar=getSheet(fileData,'BARANG'),kem=getSheet(fileData,'KEMASAN');
  if(!ent) throw new Error('Sheet ENTITAS tidak ditemukan.');
  const eh=findHeader(ent.rows,['KODE ENTITAS','NAMA ENTITAS'],20);let sender='',receiver='';
  if(eh){const role=eh.headers['KODE ENTITAS'],name=eh.headers['NAMA ENTITAS'];for(let r=eh.row+1;r<ent.rows.length;r++){const rv=cleanText(ent.rows[r]?.[role]),nv=cleanText(ent.rows[r]?.[name]);if(rv==='3'&&nv)sender=nv;if(rv==='8'&&nv)receiver=nv;}}
  if(!receiver)receiver=cleanText(ent.rows[3]?.[5]||'');if(!sender)sender=cleanText(ent.rows[1]?.[5]||'');
  const docs={};if(dok){for(const row of dok.rows){for(let i=0;i<row.length;i++){const v=cleanText(row[i]);if(['380','217','640'].includes(v)&&row[i+1])docs[v]=cleanText(row[i+1]);}}}
  const items=[];let cif=0,gw=0,nw=0;
  if(bar){const bh=findHeader(bar.rows,['KODE BARANG'],10);if(bh){const H=bh.headers,cCode=H['KODE BARANG'],cName=H['URAIAN BARANG']??H['URAIAN']??H['DESCRIPTION'],cQty=H['JUMLAH SATUAN'],cAmt=H['HARGA PENYERAHAN'],cBruto=H['BRUTO'],cNetto=H['NETTO'],cCifUsd=H['CIF'],cCifIdr=H['CIF RUPIAH'];for(let r=bh.row+1;r<bar.rows.length;r++){const row=bar.rows[r]||[],code=cleanText(row[cCode]);if(!code)continue;const amt=toNumber(cAmt!==undefined?row[cAmt]:null),b=toNumber(cBruto!==undefined?row[cBruto]:null),n=toNumber(cNetto!==undefined?row[cNetto]:null);const name=cleanText(cName!==undefined?row[cName]:'');const qty=toNumber(cQty!==undefined?row[cQty]:null);const cifUsd=toNumber(cCifUsd!==undefined?row[cCifUsd]:null),cifIdr=toNumber(cCifIdr!==undefined?row[cCifIdr]:null);const hargaPenyerahan=amt; const cifValue=cifUsd!==null?cifUsd:(cifIdr!==null?cifIdr:null); const cifCurrency=cifUsd!==null?'USD':(cifIdr!==null?'IDR':''); items.push({sequence:items.length+1,item_code:code,item_name:name,quantity:qty,price:{value:cifValue,currency:cifCurrency},prices:{USD:cifUsd,IDR:cifIdr},cif_usd:cifUsd,cif_idr:cifIdr,harga_penyerahan:hargaPenyerahan}); cif+=cifValue||0;gw+=b||0;nw+=n||0;}}}
  let packageType='',packageQty=0;if(kem){const kh=findHeader(kem.rows,['KODE KEMASAN','JUMLAH KEMASAN'],10)||findHeader(kem.rows,['KEMASAN','JUMLAH'],10);if(kh){const ct=kh.headers['KODE KEMASAN']??kh.headers['JENIS KEMASAN']??kh.headers['KEMASAN'],cq=kh.headers['JUMLAH KEMASAN']??kh.headers['JUMLAH']??kh.headers['QTY'];for(let r=kh.row+1;r<kem.rows.length;r++){const row=kem.rows[r]||[],t=cleanText(row[ct]),q=toNumber(row[cq]);if(t&&q!==null&&!['KEMASAN','KODE KEMASAN'].includes(t.toUpperCase())){packageType=t;packageQty=Math.trunc(q);}}}}
  const totalCifUsd=items.reduce((v,x)=>v+(x.cif_usd??0),0); const totalCifIdr=items.reduce((v,x)=>v+(x.cif_idr??x.harga_penyerahan??0),0); return {document_type:'draft_exim',company_sender:sender,company_receiver:receiver,invoice_no:docs['380']||'',packing_list_no:docs['217']||'',surat_jalan:docs['640']||'',items,total_cif:cif,total_cif_currency:'IDR',total_cif_by_currency:{USD:totalCifUsd,IDR:totalCifIdr},total_gw:gw,total_nw:nw,package_type:packageType,package_quantity:packageQty};
}
