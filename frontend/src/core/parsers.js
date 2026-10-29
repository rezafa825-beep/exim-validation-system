import { cleanText, toNumber, normCompany, findHeader, findHeaderWithContinuation, resolveColumn, findInlineValue, findInlineDate, extractParties, isHeaderLikeRow } from './excelReader';

function getSheet(fileData, sheetName) {
  return fileData.sheets.find(s => s.name === sheetName);
}
function rowIsAggregation(value, labels) {
  return (labels || 'TOTAL;SUBTOTAL;GRAND TOTAL').split(';').map(x => x.trim().toUpperCase()).includes(cleanText(value).toUpperCase());
}

export function parseInvoice(fileData, mapping, sheetName, currencyPreference = 'AUTO') {
  const candidates = fileData.sheets.map(sheet => {
    const h = findHeader(sheet.rows, Object.values(mapping || {}).map(v => v.primary).concat(['ITEM NAME','QTY','AMOUNT','SKU']));
    return { sheet, h, score: h?.score || 0 };
  }).sort((a,b) => b.score-a.score);
  const selectedSheet = sheetName ? getSheet(fileData, sheetName) : candidates[0]?.sheet;
  const h = sheetName ? findHeader(selectedSheet?.rows || [], ['ITEM NAME','QTY','AMOUNT','SKU']) : candidates[0]?.h;
  if (!selectedSheet || !h) throw new Error('Header Invoice tidak ditemukan.');
  const sheet=selectedSheet, headers=h.headers;
  const cCode=resolveColumn(headers,mapping,'ITEM_CODE'), cName=resolveColumn(headers,mapping,'ITEM_NAME'), cSku=headers['SKU'] ?? headers['PRODUCT SKU'] ?? null, cQty=resolveColumn(headers,mapping,'QUANTITY');
  const cAmtUsd=headers['AMOUNT'] ?? headers['AMOUNT (USD)'] ?? headers['USD AMOUNT'] ?? null;
  const cAmtIdr=headers['AMOUNT (IDR)'] ?? headers['IDR AMOUNT'] ?? headers['AMOUNT RUPIAH'] ?? null;
  const mappedAmt=resolveColumn(headers,mapping,'AMOUNT');
  let chosenCurrency='USD', cAmt=mappedAmt;
  const preference=String(currencyPreference||'AUTO').toUpperCase();
  if (preference==='IDR') { cAmt=cAmtIdr!==null?cAmtIdr:(headers['AMOUNT']!==undefined?headers['AMOUNT']:null); chosenCurrency='IDR'; }
  else if (preference==='USD') { cAmt=cAmtUsd!==null?cAmtUsd:(headers['AMOUNT']!==undefined?headers['AMOUNT']:null); chosenCurrency='USD'; }
  else {
    if (cAmt===null) cAmt=cAmtUsd!==null?cAmtUsd:cAmtIdr;
    const headerName=Object.keys(headers).find(k=>headers[k]===cAmt)||'';
    chosenCurrency=/IDR|RUPIAH/i.test(headerName)?'IDR':'USD';
  }
  const cSj=resolveColumn(headers,mapping,'SURAT_JALAN'), cInv=resolveColumn(headers,mapping,'INVOICE_NUMBER');
  const items=[]; let surat='', inv='';
  for (let r=h.row+1;r<sheet.rows.length;r++) {
    const row=sheet.rows[r]||[]; const name=cleanText(cName!==null?row[cName]:'');
    if (!name || rowIsAggregation(name,'TOTAL;SUBTOTAL;GRAND TOTAL') || isHeaderLikeRow(row,headers)) continue;
    const qty=toNumber(cQty!==null?row[cQty]:null);
    const rawUsd=toNumber(cAmtUsd!==null?row[cAmtUsd]:null), rawIdr=toNumber(cAmtIdr!==null?row[cAmtIdr]:null);
    const genericAmountOnly=headers['AMOUNT']!==undefined&&headers['AMOUNT (USD)']===undefined&&headers['USD AMOUNT']===undefined&&cAmtIdr===null;
    const usd=preference==='IDR'&&genericAmountOnly?null:rawUsd;
    const idr=preference==='IDR'&&genericAmountOnly?rawUsd:(preference==='USD'&&genericAmountOnly?null:rawIdr);
    const chosenValue=cAmt!==null?toNumber(row[cAmt]):null;
    const amountCurrency=chosenCurrency;
    const priceValue=preference==='AUTO' ? chosenValue : (preference==='IDR'?(idr!==null?idr:(cAmtIdr===null&&headers['AMOUNT']!==undefined?chosenValue:null)):(usd!==null?usd:chosenValue));
    const priceUsd=preference==='USD'&&usd===null?priceValue:usd;
    const priceIdr=preference==='IDR'&&idr===null&&genericAmountOnly?priceValue:idr;
    items.push({sequence:items.length+1,item_code:cleanText(cCode!==null?row[cCode]:''),item_sku:cleanText(cSku!==null?row[cSku]:''),item_name:name,quantity:qty,amount:priceValue,price:{value:priceValue,currency:amountCurrency},prices:{USD:priceUsd,IDR:priceIdr},price_usd:priceUsd,price_idr:priceIdr});
    if (cSj!==null && cleanText(row[cSj])) surat=cleanText(row[cSj]);
    if (cInv!==null && cleanText(row[cInv])) inv=cleanText(row[cInv]);
  }
  if (!inv) inv=findInlineValue(sheet.rows,['INVOICE NO','INVOICE NUMBER']);
  if (!surat) surat=findInlineValue(sheet.rows,['SURAT JALAN','SURAT']);
  const invoiceDate=findInlineDate(sheet.rows);
  const total = items.some(x=>x.price.value!==null) ? items.reduce((v,x)=>v+(x.price.value??0),0) : null;
  const totalUsd = items.some(x=>x.price_usd!==null) ? items.reduce((v,x)=>v+(x.price_usd??0),0) : null;
  const totalIdr = items.some(x=>x.price_idr!==null) ? items.reduce((v,x)=>v+(x.price_idr??0),0) : null;
  return {document_type:'invoice',invoice_no:inv,invoice_date:invoiceDate,surat_jalan:surat,items,total_cif:total,total_cif_currency:chosenCurrency,total_cif_by_currency:{USD:totalUsd,IDR:totalIdr},...extractParties(sheet.rows)};
}

export function parsePackingList(fileData, mapping, rowRule, sheetName) {
  const required = Object.values(mapping||{}).map(v=>v.primary).concat(['ITEM NAME','QTY','GW','NW','KEMASAN']);
  const candidates=fileData.sheets.map(sheet=>{const h=findHeaderWithContinuation(sheet.rows,required,40,2);const bonus=h?['KEMASAN','GW','NW','ITEM NAME','QTY'].filter(x=>h.headers[x]!==undefined).length*5:0;return {sheet,h,score:(h?.score||0)+bonus};}).sort((a,b)=>b.score-a.score);
  const chosen=sheetName?{sheet:getSheet(fileData,sheetName),h:findHeaderWithContinuation(getSheet(fileData,sheetName)?.rows||[],['ITEM NAME','QTY','GW','NW','KEMASAN'],40,2)}:candidates[0];
  if(!chosen?.sheet||!chosen?.h) throw new Error('Header Packing List tidak ditemukan.');
  const {sheet,h}=chosen, headers={...h.headers};
  const cCode=resolveColumn(headers,mapping,'ITEM_CODE'),cName=resolveColumn(headers,mapping,'ITEM_NAME'),cQty=resolveColumn(headers,mapping,'QUANTITY'),cGw=resolveColumn(headers,mapping,'GROSS_WEIGHT'),cNw=resolveColumn(headers,mapping,'NET_WEIGHT'),cPkg=resolveColumn(headers,mapping,'PACKAGE'),cPl=resolveColumn(headers,mapping,'PACKING_LIST_NO');
  const items=[];let totalGw=0,totalNw=0,plno='',pkgType='',pkgQty=0;const labels=rowRule?.aggregation_labels||'TOTAL;SUBTOTAL;GRAND TOTAL';
  for(let r=h.row+1;r<sheet.rows.length;r++) {
    const row=sheet.rows[r]||[], name=cleanText(cName!==null?row[cName]:'');
    if(!name||rowIsAggregation(name,labels)||isHeaderLikeRow(row,headers))continue;
    const qty=toNumber(cQty!==null?row[cQty]:null),gw=toNumber(cGw!==null?row[cGw]:null),nw=toNumber(cNw!==null?row[cNw]:null),itemCode=cleanText(cCode!==null?row[cCode]:'');
    if(!itemCode&&qty===null&&gw===null&&nw===null)continue;
    items.push({sequence:items.length+1,item_code:itemCode,item_name:name,quantity:qty,gross_weight:gw,net_weight:nw,package_value:cleanText(cPkg!==null?row[cPkg]:'')});
    totalGw+=gw||0;totalNw+=nw||0;
    if(cPl!==null&&cleanText(row[cPl]))plno=cleanText(row[cPl]);
  }
  // The package label often appears in the continuation header (e.g. POLYBAG), not in the item rows.
  if(cPkg!==null){
    for(let rr=h.row+1;rr<=Math.min(sheet.rows.length-1,h.row+3);rr++){const raw=cleanText((sheet.rows[rr]||[])[cPkg]);if(raw&&toNumber(raw)===null&&!/^(KEMASAN|PACKAGE|TOTAL|GRAND TOTAL)$/i.test(raw)){pkgType=raw;break;}}
    // Prefer an explicit Grand Total/Total row. Otherwise sum only numeric item rows, excluding subtotals.
    for(let rr=sheet.rows.length-1;rr>h.row;rr--){const row=sheet.rows[rr]||[];const rowText=row.map(cleanText).join(' ').toUpperCase();if(/GRAND TOTAL/.test(rowText)||/^TOTAL\b/.test(cleanText(row.find(v=>/^TOTAL$/i.test(cleanText(v)))))){const q=toNumber(row[cPkg]);if(q!==null){pkgQty=Math.trunc(q);break;}}}
    if(!pkgQty){for(let rr=h.row+1;rr<sheet.rows.length;rr++){const row=sheet.rows[rr]||[];const name=cleanText(cName!==null?row[cName]:'');if(!name||rowIsAggregation(name,labels)||isHeaderLikeRow(row,headers))continue;const q=toNumber(row[cPkg]);if(q!==null)pkgQty+=Math.trunc(q);}}
  }
  if(!plno)plno=findInlineValue(sheet.rows,['PACKING LIST NO','PL NO','INVOICE NO']);
  return {document_type:'packing_list',packing_list_no:plno,packing_list_date:findInlineDate(sheet.rows),items,total_gw:totalGw,total_nw:totalNw,package_type:pkgType,package_quantity:pkgQty,...extractParties(sheet.rows)};
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
  const items=[];let gw=0,nw=0;
  if(bar){const bh=findHeader(bar.rows,['KODE BARANG'],10);if(bh){const H=bh.headers,cCode=H['KODE BARANG'],cName=H['URAIAN BARANG']??H['URAIAN']??H['DESCRIPTION']??H['URAIAN BARANG'],cSpec=H['SPESIFIKASI LAIN']??8,cQty=H['JUMLAH SATUAN'],cAmt=H['HARGA PENYERAHAN'],cBruto=H['BRUTO']??20,cNetto=H['NETTO']??19,cCifUsd=H['CIF'],cCifIdr=H['CIF RUPIAH'];for(let r=bh.row+1;r<bar.rows.length;r++){const row=bar.rows[r]||[],code=cleanText(row[cCode]);if(!code)continue;const amt=toNumber(cAmt!==undefined?row[cAmt]:null),b=toNumber(row[cBruto]),n=toNumber(row[cNetto]),name=cleanText(cName!==undefined?row[cName]:''),sku=cleanText(row[cSpec]),qty=toNumber(cQty!==undefined?row[cQty]:null),cifUsd=toNumber(cCifUsd!==undefined?row[cCifUsd]:null),cifIdr=toNumber(cCifIdr!==undefined?row[cCifIdr]:null),cifValue=cifUsd!==null?cifUsd:(cifIdr!==null?cifIdr:null),cifCurrency=cifUsd!==null?'USD':(cifIdr!==null?'IDR':'');items.push({sequence:items.length+1,item_code:code,item_name:name,item_sku:sku,quantity:qty,price:{value:cifValue,currency:cifCurrency},prices:{USD:cifUsd,IDR:cifIdr},cif_usd:cifUsd,cif_idr:cifIdr,harga_penyerahan:amt,gross_weight:b,net_weight:n});gw+=b||0;nw+=n||0;}}}
  let packageType='',packageQty=0;if(kem){const kh=findHeader(kem.rows,['KODE KEMASAN','JUMLAH KEMASAN'],10)||findHeader(kem.rows,['KEMASAN','JUMLAH'],10);if(kh){const ct=kh.headers['KODE KEMASAN']??kh.headers['JENIS KEMASAN']??kh.headers['KEMASAN'],cq=kh.headers['JUMLAH KEMASAN']??kh.headers['JUMLAH']??kh.headers['QTY'];const types=new Set();for(let r=kh.row+1;r<kem.rows.length;r++){const row=kem.rows[r]||[],t=cleanText(row[ct]),q=toNumber(row[cq]);if(t&&q!==null&&!['KEMASAN','KODE KEMASAN'].includes(t.toUpperCase())){types.add(t);packageQty+=Math.trunc(q);}}packageType=[...types].join(', ');}}
  const totalCifUsd=items.some(x=>x.cif_usd!==null)?items.reduce((v,x)=>v+(x.cif_usd??0),0):null; const totalCifIdr=items.some(x=>x.cif_idr!==null)?items.reduce((v,x)=>v+(x.cif_idr??0),0):null;
  const cifCurrency=totalCifUsd!==null?'USD':'IDR';const totalCif=cifCurrency==='USD'?totalCifUsd:totalCifIdr;
  return {document_type:'draft_exim',company_sender:sender,company_receiver:receiver,invoice_no:docs['380']||'',packing_list_no:docs['217']||'',surat_jalan:docs['640']||'',items,total_cif:totalCif,total_cif_currency:cifCurrency,total_cif_by_currency:{USD:totalCifUsd,IDR:totalCifIdr},total_gw:gw,total_nw:nw,package_type:packageType,package_quantity:packageQty};
}

