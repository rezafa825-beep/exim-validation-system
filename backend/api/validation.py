import json, tempfile, os
from fastapi import APIRouter, UploadFile, File, HTTPException
from parsers.excel_parser import open_book, detect_document_type, detect_document_sheets
from parsers.draft_exim_parser import parse_draft
from parsers.table_parser import parse_invoice, parse_pl
from core.customer import find_customer, get_mapping, get_row_rule
from core.crosscheck import crosscheck
from database.database import get_conn

router=APIRouter(prefix="/api/validation", tags=["validation"])

@router.post("/validate")
async def validate(files: list[UploadFile]=File(...)):
    temp=[]
    try:
        for f in files:
            suffix=os.path.splitext(f.filename or '')[1] or '.xlsx'
            fd,path=tempfile.mkstemp(suffix=suffix); os.close(fd)
            with open(path,'wb') as out: out.write(await f.read())
            temp.append((f.filename,path))
        docs=[]
        for name,path in temp:
            wb=open_book(path)
            for sheet_name,dtype,scores in detect_document_sheets(wb):
                if dtype != 'unknown':
                    docs.append((name,path,wb,sheet_name,dtype,scores))
        draft=next((x for x in docs if x[4]=='draft_exim'),None)
        if not draft: raise HTTPException(400,"Draft EXIM tidak terdeteksi.")
        draft_data=parse_draft(draft[2])
        customer=find_customer(draft_data.get('company_receiver'))
        if not customer: raise HTTPException(400,f"Customer belum ada di Customer Master: {draft_data.get('company_receiver')}")
        inv_rec=next((x for x in docs if x[4]=='invoice'),None)
        pl_rec=next((x for x in docs if x[4]=='packing_list'),None)
        if not inv_rec or not pl_rec: raise HTTPException(400,"Invoice dan Packing List wajib tersedia.")
        inv_mapping=get_mapping(customer['id'],'invoice')
        pl_mapping=get_mapping(customer['id'],'packing_list')
        required_inv=['INVOICE_NUMBER','ITEM_CODE','ITEM_NAME','QUANTITY','AMOUNT']
        required_pl=['PACKING_LIST_NO','ITEM_CODE','ITEM_NAME','QUANTITY','GROSS_WEIGHT','NET_WEIGHT']
        missing_inv=[f for f in required_inv if not inv_mapping.get(f,{}).get('primary') and not inv_mapping.get(f,{}).get('alternatives')]
        missing_pl=[f for f in required_pl if not pl_mapping.get(f,{}).get('primary') and not pl_mapping.get(f,{}).get('alternatives')]
        if missing_inv or missing_pl:
            parts=[]
            if missing_inv: parts.append('Invoice: '+', '.join(missing_inv))
            if missing_pl: parts.append('Packing List: '+', '.join(missing_pl))
            raise HTTPException(400,'Mapping Customer Master belum lengkap. ' + ' | '.join(parts))
        inv=parse_invoice(inv_rec[2],inv_mapping,inv_rec[3])
        pl=parse_pl(pl_rec[2],pl_mapping,get_row_rule(customer['id']),pl_rec[3])
        extraction_issues=[]
        if not inv.get('invoice_no'): extraction_issues.append('Invoice Number tidak terbaca')
        if not pl.get('packing_list_no'): extraction_issues.append('Packing List Number tidak terbaca')
        if not inv.get('items'): extraction_issues.append('Item Invoice tidak terbaca')
        if not pl.get('items'): extraction_issues.append('Item Packing List tidak terbaca')
        if extraction_issues:
            raise HTTPException(400,'Dokumen belum dapat dipetakan dengan yakin: ' + '; '.join(extraction_issues) + '. Periksa Customer Master/Header Mapping.')
        result=crosscheck(inv,pl,draft_data)
        conn=get_conn()
        cur=conn.execute("INSERT INTO validation_sessions(customer_id,invoice_no,packing_list_no,surat_jalan,status,result_json) VALUES (?,?,?,?,?,?)",(customer['id'],inv.get('invoice_no'),pl.get('packing_list_no'),inv.get('surat_jalan'),result['overall_status'],json.dumps(result)))
        sid=cur.lastrowid
        for item in result['items']:
            conn.execute("INSERT INTO validation_details(session_id,sequence,result_json) VALUES (?,?,?)",(sid,item['sequence'],json.dumps(item)))
        conn.commit(); conn.close()
        return {"session_id":sid,"customer":customer['customer_name'],"invoice":inv,"packing_list":pl,"draft":draft_data,"result":result}
    finally:
        for _,path in temp:
            try: os.remove(path)
            except: pass
