import json
from fastapi import APIRouter
from database.database import get_conn
router=APIRouter(prefix="/api/history",tags=["history"])
@router.get("")
def history():
    c=get_conn(); rows=[dict(r) for r in c.execute("SELECT v.id,v.customer_id,c.customer_name,v.invoice_no,v.packing_list_no,v.surat_jalan,v.status,v.created_at FROM validation_sessions v LEFT JOIN customers c ON c.id=v.customer_id ORDER BY v.id DESC")]; c.close(); return rows
@router.get("/{session_id}")
def detail(session_id:int):
    c=get_conn(); row=c.execute("SELECT v.*,c.customer_name FROM validation_sessions v LEFT JOIN customers c ON c.id=v.customer_id WHERE v.id=?",(session_id,)).fetchone(); c.close()
    if not row:return {"error":"not found"}
    d=dict(row); d['result']=json.loads(d.pop('result_json')); return d
