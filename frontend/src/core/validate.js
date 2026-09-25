import { readExcelFile, detectWorkbook } from './excelReader';
import { parseInvoice, parsePackingList, parseDraft, parseSuratJalan } from './parsers';
import { crosscheck } from './crosscheck';
import { findCustomer } from './customers';

export async function validateFiles(files){
  const fileData=await Promise.all(files.map(readExcelFile));
  const docs=fileData.flatMap(file=>detectWorkbook(file).map(d=>({...d,file})));
  const detected_documents=docs.map(x=>({file:x.file.name,type:x.type,sheet:x.sheetName})); const draftRec=docs.find(x=>x.type==='draft_exim');
  if(!draftRec) throw new Error('Draft EXIM tidak terdeteksi.');
  const draft=parseDraft(draftRec.file); const customer=findCustomer(draft.company_receiver);
  if(!customer) throw new Error(`Customer belum ada di Customer Master: ${draft.company_receiver||'tidak terbaca'}`);
  const invRec=docs.find(x=>x.type==='invoice'); const plRec=docs.find(x=>x.type==='packing_list'); const sjRec=docs.find(x=>x.type==='surat_jalan');
  if(!invRec||!plRec) throw new Error('Invoice dan Packing List wajib tersedia.');
  const inv=parseInvoice(invRec.file,customer.mappings.invoice,invRec.sheetName); const pl=parsePackingList(plRec.file,customer.mappings.packing_list,customer.row_rule,plRec.sheetName); const sj=sjRec ? parseSuratJalan(sjRec.file,customer.mappings.surat_jalan||customer.mappings.invoice,sjRec.sheetName) : null; if(sj?.surat_jalan) inv.surat_jalan=sj.surat_jalan;
  const issues=[];if(!inv.invoice_no)issues.push('Invoice Number tidak terbaca');if(!pl.packing_list_no)issues.push('Packing List Number tidak terbaca');if(!inv.items.length)issues.push('Item Invoice tidak terbaca');if(!pl.items.length)issues.push('Item Packing List tidak terbaca');if(issues.length)throw new Error(`Dokumen belum dapat dipetakan dengan yakin: ${issues.join('; ')}. Periksa struktur/header file.`);
  const result=crosscheck(inv,pl,draft,sj);return {session_id:crypto.randomUUID(),customer:customer.customer_name,invoice:inv,packing_list:pl,surat_jalan:sj,draft,result,detected_documents,created_at:new Date().toISOString()};
}
