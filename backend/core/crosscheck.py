from decimal import Decimal
from core.utils import norm_company, norm_code, norm_name


def eq_num(a,b,tol=Decimal('0.000001')):
    if a is None or b is None:return False
    return abs(Decimal(str(a))-Decimal(str(b))) <= tol


def status(a,b,normalizer=lambda x:x):
    return "MATCH" if normalizer(a)==normalizer(b) else "NOT MATCH"


def crosscheck(invoice, pl, draft):
    checks={}
    sender_ok = norm_company(invoice.get('company_sender')) == norm_company(draft.get('company_sender'))
    receiver_ok = norm_company(invoice.get('company_receiver')) == norm_company(draft.get('company_receiver'))
    checks['company']='MATCH' if sender_ok and receiver_ok else 'NOT MATCH'
    checks['invoice_number']=status(invoice.get('invoice_no'),draft.get('invoice_no'))
    checks['packing_list_number']=status(pl.get('packing_list_no'),draft.get('packing_list_no'))
    checks['surat_jalan']=status(invoice.get('surat_jalan'),draft.get('surat_jalan'))
    checks['total_cif']='MATCH' if eq_num(invoice.get('total_cif'),draft.get('total_cif')) else 'NOT MATCH'
    checks['total_gw']='MATCH' if eq_num(pl.get('total_gw'),draft.get('total_gw')) else 'NOT MATCH'
    checks['total_nw']='MATCH' if eq_num(pl.get('total_nw'),draft.get('total_nw')) else 'NOT MATCH'
    checks['package']='MATCH' if norm_code(pl.get('package_type'))==norm_code(draft.get('package_type')) and eq_num(pl.get('package_quantity'),draft.get('package_quantity')) else 'NOT MATCH'
    ii,pi,di=invoice.get('items',[]),pl.get('items',[]),draft.get('items',[])
    order_ok=len(ii)==len(di) and len(ii)==len(pi)
    if order_ok:
        for a,b,c in zip(ii,pi,di):
            if norm_code(a.get('item_code'))!=norm_code(b.get('item_code')) or norm_code(a.get('item_code'))!=norm_code(c.get('item_code')):
                order_ok=False;break
    checks['item_order']='MATCH' if order_ok else 'NOT MATCH'
    item_code_ok=True; item_name_ok=True; qty_ok=True; details=[]; notes=[]
    n=max(len(ii),len(pi),len(di))
    for idx in range(n):
        a=ii[idx] if idx<len(ii) else {}; b=pi[idx] if idx<len(pi) else {}; c=di[idx] if idx<len(di) else {}
        code_a,code_b,code_c=norm_code(a.get('item_code')),norm_code(b.get('item_code')),norm_code(c.get('item_code'))
        name_a,name_b,name_c=norm_name(a.get('item_name')),norm_name(b.get('item_name')),norm_name(c.get('item_name'))
        q_a,q_c=a.get('quantity'),c.get('quantity')
        cm=code_a==code_b==code_c
        nm=name_a==name_b==name_c
        qm=eq_num(q_a,q_c)
        item_code_ok &= cm; item_name_ok &= nm; qty_ok &= qm
        # Keep per-value status useful when only one source differs.
        code_status={"invoice":"MATCH" if code_a==code_c else "NOT MATCH","pl":"MATCH" if code_b==code_c else "NOT MATCH","draft":"MATCH" if code_c==code_a==code_b else "NOT MATCH"}
        name_status={"invoice":"MATCH" if name_a==name_c else "NOT MATCH","pl":"MATCH" if name_b==name_c else "NOT MATCH","draft":"MATCH" if name_c==name_a==name_b else "NOT MATCH"}
        d={"sequence":idx+1,"invoice_code":a.get('item_code'),"pl_code":b.get('item_code'),"draft_code":c.get('item_code'),"invoice_name":a.get('item_name'),"pl_name":b.get('item_name'),"draft_name":c.get('item_name'),"invoice_quantity":q_a,"draft_quantity":q_c,"item_code_status":"MATCH" if cm else "NOT MATCH","item_code_cell_status":code_status,"item_name_status":"MATCH" if nm else "NOT MATCH","item_name_cell_status":name_status,"quantity_status":"MATCH" if qm else "NOT MATCH"}
        details.append(d)
        if cm and not nm: notes.append(f"Item No. {idx+1}: Item Code sama, tetapi Item Name berbeda.")
    checks['item_code']='MATCH' if item_code_ok else 'NOT MATCH'
    checks['item_name']='MATCH' if item_name_ok else 'NOT MATCH'
    checks['quantity']='MATCH' if qty_ok else 'NOT MATCH'
    decisive=['company','invoice_number','packing_list_number','surat_jalan','total_cif','total_gw','total_nw','package','item_order','item_code','quantity']
    overall='MATCH' if all(checks[x]=='MATCH' for x in decisive) else 'NOT MATCH'
    mismatches=[x for x in decisive if checks[x]=='NOT MATCH']
    return {"overall_status":overall,"checks":checks,"mismatches":mismatches,"notes":notes,"items":details}
