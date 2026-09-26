const KEY='exim-web-customers-v1';
const aliases={INVOICE_NUMBER:['INVOICE NO','INVOICE NUMBER','INVOICE'],ITEM_CODE:['SKU','STYLE','MATERIAL CODE','PRODUCT CODE','ARTICLE'],ITEM_NAME:['ITEM NAME','DESCRIPTION','DESC'],QUANTITY:['QTY','QUANTITY','JUMLAH','TOTAL QTY'],AMOUNT:['AMOUNT'],SURAT_JALAN:['SURAT','SURAT JALAN'],GROSS_WEIGHT:['GW','GROSS WT','GROSS WEIGHT'],NET_WEIGHT:['NW','NET WT','NET WEIGHT'],PACKAGE:['KEMASAN','PACKAGE','PACKAGE TYPE']};
const make=(name,invoice,pl)=>({id:name,status:'ACTIVE',customer_name:name,mappings:{invoice:Object.fromEntries(Object.entries(invoice).map(([k,v])=>[k,{primary:v,alternatives:(aliases[k]||[]).filter(a=>a!==v)}])),packing_list:Object.fromEntries(Object.entries(pl).map(([k,v])=>[k,{primary:v,alternatives:(aliases[k]||[]).filter(a=>a!==v)}]))},row_rule:{item_identifier:'ITEM NAME',aggregation_labels:'TOTAL;SUBTOTAL;GRAND TOTAL',continue_after_aggregation:true}});
const defaults=[make('PT. SHOETOWN LIGUNG INDONESIA',{INVOICE_NUMBER:'INVOICE NO',ITEM_CODE:'STYLE',ITEM_NAME:'ITEM NAME',QUANTITY:'QTY',AMOUNT:'AMOUNT',SURAT_JALAN:'SURAT'},{PACKING_LIST_NO:'INVOICE NO',ITEM_CODE:'STYLE',ITEM_NAME:'ITEM NAME',QUANTITY:'QTY',GROSS_WEIGHT:'GW',NET_WEIGHT:'NW',PACKAGE:'KEMASAN'}),make('PT. YIH QUAN FOOTWEAR INDONESIA',{INVOICE_NUMBER:'INVOICE NO',ITEM_CODE:'SKU',ITEM_NAME:'ITEM NAME',QUANTITY:'QTY',AMOUNT:'AMOUNT',SURAT_JALAN:'SURAT'},{PACKING_LIST_NO:'INVOICE NO',ITEM_CODE:'SKU',ITEM_NAME:'ITEM NAME',QUANTITY:'TOTAL QTY',GROSS_WEIGHT:'GW',NET_WEIGHT:'NW',PACKAGE:'KEMASAN'}),make('PT. ADONIA FOOTWEAR INDONESIA',{INVOICE_NUMBER:'INVOICE NO',ITEM_CODE:'MATERIAL CODE',ITEM_NAME:'ITEM NAME',QUANTITY:'QTY',AMOUNT:'AMOUNT',SURAT_JALAN:'SURAT JALAN'},{PACKING_LIST_NO:'INVOICE NO',ITEM_CODE:'MATERIAL CODE',ITEM_NAME:'ITEM NAME',QUANTITY:'QTY',GROSS_WEIGHT:'GW',NET_WEIGHT:'NW',PACKAGE:'KEMASAN'})];
export function getCustomers(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return Array.isArray(x)&&x.length?x:defaults;}catch{return defaults}}
export function saveCustomers(rows){localStorage.setItem(KEY,JSON.stringify(rows));}
export function findCustomer(name){
  const n=String(name||'').toUpperCase().replace(/^PT\.?\s*/,'').replace(/\s+/g,' ').trim();
  if(!n) return null;
  const rows=getCustomers();
  const exact=rows.find(c=>String(c.customer_name||'').toUpperCase().replace(/^PT\.?\s*/,'').replace(/\s+/g,' ').trim()===n);
  if(exact) return exact;
  const scored=rows.map(c=>{
    const x=String(c.customer_name||'').toUpperCase().replace(/^PT\.?\s*/,'').replace(/\s+/g,' ').trim();
    const score=x===n?100:(x.includes(n)||n.includes(x)?50:0);
    return {c,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  return scored[0]?.c||null;
}
export function upsertCustomer(row){const rows=getCustomers();const i=rows.findIndex(x=>x.id===row.id);if(i>=0)rows[i]=row;else rows.push({...row,id:crypto.randomUUID()});saveCustomers(rows);return rows;}
