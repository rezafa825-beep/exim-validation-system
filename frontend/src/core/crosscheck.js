import { normCompany, normCode, normName } from './excelReader';

const eq=(a,b,tol=1e-6)=>a!==null&&a!==undefined&&b!==null&&b!==undefined&&Math.abs(Number(a)-Number(b))<=tol;
const status=(a,b,n=x=>x)=>n(a)===n(b)?'MATCH':'NOT MATCH';

function pickPrice(item, preferredCurrency){
  if(!item) return null;
  const c=preferredCurrency||item.price?.currency;
  if(item.prices?.[c]!==null&&item.prices?.[c]!==undefined) return {value:item.prices[c],currency:c};
  if(item.price?.currency===c&&item.price?.value!==null&&item.price?.value!==undefined) return item.price;
  return null;
}
function money(a,b){
  return !!a&&!!b&&!!a.currency&&!!b.currency&&a.currency===b.currency&&eq(a.value,b.value);
}
function matchScore(src,candidate){
  const sc=normCode(src?.item_code), cc=normCode(candidate?.item_code);
  if(!sc||!cc||sc!==cc) return -1;
  let score=100;
  if(eq(src.quantity,candidate.quantity)) score+=30;
  if(normName(src.item_name)&&normName(src.item_name)===normName(candidate.item_name)) score+=20;
  return score;
}
function consumeBest(src,pool,used){
  let best=null,bestScore=-1;
  for(const x of pool){
    if(used.has(x._i)) continue;
    const s=matchScore(src,x);
    if(s>bestScore){best=x;bestScore=s;}
  }
  if(bestScore<0)return null;
  used.add(best._i); return best;
}
function pairItems(invoiceItems=[],plItems=[],draftItems=[]){
  const rows=(draftItems||[]).map(d=>({inv:null,pl:null,draft:d}));
  const attach=(source,type)=>{
    let best=null,bestScore=-1;
    for(const row of rows){
      if(row[type]||!row.draft) continue;
      const score=matchScore(source,row.draft);
      if(score>bestScore){best=row;bestScore=score;}
    }
    if(best){best[type]=source;return;}
    rows.push({inv:type==='inv'?source:null,pl:type==='pl'?source:null,draft:null});
  };
  for(const item of invoiceItems||[]) attach(item,'inv');
  for(const item of plItems||[]) attach(item,'pl');
  return rows;
}

export function crosscheck(invoice,pl,draft,sj=null){
  const checks={};
  checks.company=normCompany(invoice.company_sender)===normCompany(draft.company_sender)&&normCompany(invoice.company_receiver)===normCompany(draft.company_receiver)?'MATCH':'NOT MATCH';
  checks.invoice_number=status(invoice.invoice_no,draft.invoice_no);
  checks.packing_list_number=status(pl.packing_list_no,draft.packing_list_no);
  checks.surat_jalan=status(sj?.surat_jalan || invoice.surat_jalan,draft.surat_jalan);
  const totalInv=invoice.total_cif_by_currency?.[invoice.total_cif_currency] ?? invoice.total_cif;
  const totalDraft=draft.total_cif_by_currency?.[invoice.total_cif_currency];
  checks.total_cif=totalDraft!==null&&totalDraft!==undefined&&eq(totalInv,totalDraft)?'MATCH':'NOT MATCH';
  checks.total_gw=eq(pl.total_gw,draft.total_gw)?'MATCH':'NOT MATCH';
  checks.total_nw=eq(pl.total_nw,draft.total_nw)?'MATCH':'NOT MATCH';
  checks.package=normCode(pl.package_type)===normCode(draft.package_type)&&eq(pl.package_quantity,draft.package_quantity)?'MATCH':'NOT MATCH';

  const paired=pairItems(invoice.items||[],pl.items||[],draft.items||[]);
  let codeOk=true,nameOk=true,qtyOk=true,priceOk=true;
  const details=[],notes=[];
  paired.forEach((row,i)=>{
    const a=row.inv||{},b=row.pl||{},c=row.draft||{};
    const ca=normCode(a.item_code),cb=normCode(b.item_code),cc=normCode(c.item_code);
    const na=normName(a.item_name),nb=normName(b.item_name),nc=normName(c.item_name);
    const cm=!!ca&&ca===cc&&(!b.item_code||!cb||ca===cb);
    const nm=!!na&&na===nc&&(!b.item_name||!nb||na===nb);
    const qm=eq(a.quantity,c.quantity)&&((b.quantity===null||b.quantity===undefined||b.quantity==='')||eq(b.quantity,c.quantity));
    const invoiceCurrency=a.price?.currency||invoice.total_cif_currency||'USD';
    const ap=pickPrice(a,invoiceCurrency),cp=pickPrice(c,invoiceCurrency);
    const pm=money(ap,cp);
    codeOk&&=cm; nameOk&&=nm; qtyOk&&=qm; priceOk&&=pm;
    if(cm&&!nm)notes.push(`Item No. ${i+1}: Item Code sama, tetapi Item Name berbeda.`);
    if(!ca&&cc)notes.push(`Item No. ${i+1}: Item Code Draft tidak ditemukan di Invoice.`);
    if(ca&&!cc)notes.push(`Item No. ${i+1}: Item Code Invoice tidak ditemukan di Draft.`);
    if(ap?.currency&&cp?.currency&&ap.currency!==cp.currency)notes.push(`Item No. ${i+1}: Valuta harga berbeda (${ap.currency} vs ${cp.currency}).`);
    details.push({sequence:i+1,invoice_code:a.item_code||'',pl_code:b.item_code||'',draft_code:c.item_code||'',invoice_name:a.item_name||'',pl_name:b.item_name||'',draft_name:c.item_name||'',invoice_quantity:a.quantity,draft_quantity:c.quantity,pl_quantity:b.quantity,invoice_price:ap?.value??null,invoice_currency:ap?.currency||'',draft_price:cp?.value??null,draft_currency:cp?.currency||'',item_code_status:cm?'MATCH':'NOT MATCH',item_code_cell_status:{invoice:ca===cc&&!!ca?'MATCH':'NOT MATCH',pl:(!cb||cb===cc)&&!!cc?'MATCH':'NOT MATCH',draft:cm?'MATCH':'NOT MATCH'},item_name_status:nm?'MATCH':'NOT MATCH',item_name_cell_status:{invoice:na===nc&&!!na?'MATCH':'NOT MATCH',pl:(!nb||nb===nc)&&!!nc?'MATCH':'NOT MATCH',draft:nm?'MATCH':'NOT MATCH'},quantity_status:qm?'MATCH':'NOT MATCH',price_status:pm?'MATCH':'NOT MATCH'});
  });
  checks.item_code=codeOk?'MATCH':'NOT MATCH'; checks.item_name=nameOk?'MATCH':'NOT MATCH'; checks.quantity=qtyOk?'MATCH':'NOT MATCH'; checks.item_price=priceOk?'MATCH':'NOT MATCH';
  const decisive=['company','invoice_number','packing_list_number','surat_jalan','total_cif','total_gw','total_nw','package','item_code','item_name','quantity','item_price'];
  const mismatches=decisive.filter(k=>checks[k]!=='MATCH');
  return {overall_status:mismatches.length?'NOT MATCH':'MATCH',checks,mismatches,notes,items:details};
}
