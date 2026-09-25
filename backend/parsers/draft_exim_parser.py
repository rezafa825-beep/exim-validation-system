from core.utils import clean_text, norm_company, to_number, json_num


def find_sheet(wb, name):
    for ws in wb.worksheets:
        if ws.title.upper() == name.upper(): return ws
    return None


def parse_draft(wb):
    ent = find_sheet(wb,"ENTITAS")
    dok = find_sheet(wb,"DOKUMEN")
    bar = find_sheet(wb,"BARANG")
    kem = find_sheet(wb,"KEMASAN")
    if not ent: raise ValueError("Sheet ENTITAS tidak ditemukan")
    # Draft entity roles are identified by KODE ENTITAS rather than row number.
    # 3 = sender/supplier in this document family; 8 = consignee/receiver.
    sender = None
    receiver = ent["F4"].value
    ent_headers={clean_text(ent.cell(1,c).value).upper():c for c in range(1,ent.max_column+1) if clean_text(ent.cell(1,c).value)}
    c_role=ent_headers.get("KODE ENTITAS")
    c_name_ent=ent_headers.get("NAMA ENTITAS")
    if c_role and c_name_ent:
        for rr in range(2,ent.max_row+1):
            role=clean_text(ent.cell(rr,c_role).value)
            name=clean_text(ent.cell(rr,c_name_ent).value)
            if role == "3" and name:
                sender=name
            if role == "8" and name:
                receiver=name
    if not sender:
        sender=clean_text(ent["F2"].value)
    def docs():
        out={}
        if not dok: return out
        for row in dok.iter_rows(values_only=True):
            vals=[clean_text(x) for x in row]
            for i,v in enumerate(vals):
                if v in {"380","217","640"} and i+1<len(vals): out[v]=vals[i+1]
        return out
    d=docs()
    items=[]
    totals={"cif":0,"gw":0,"nw":0}
    if bar:
        headers={}
        for c in range(1,bar.max_column+1):
            v=clean_text(bar.cell(1,c).value).upper()
            if v: headers[v]=c
        # search first 5 rows for actual header
        for r in range(1,min(bar.max_row,8)+1):
            headers={clean_text(bar.cell(r,c).value).upper():c for c in range(1,bar.max_column+1) if clean_text(bar.cell(r,c).value)}
            if "KODE BARANG" in headers: break
        def col(*names):
            for n in names:
                if n in headers:return headers[n]
            return None
        c_code=col("KODE BARANG"); c_name=col("URAIAN BARANG","URAIAN","DESCRIPTION"); c_qty=col("JUMLAH SATUAN"); c_amt=col("HARGA PENYERAHAN"); c_bruto=col("BRUTO"); c_netto=col("NETTO")
        if c_code:
            for r in range(r+1,bar.max_row+1):
                code=bar.cell(r,c_code).value
                if code in (None,""): continue
                item={"sequence":len(items)+1,"item_code":clean_text(code),"item_name":clean_text(bar.cell(r,c_name).value) if c_name else "","quantity":json_num(to_number(bar.cell(r,c_qty).value)) if c_qty else None}
                items.append(item)
                totals["cif"] += to_number(bar.cell(r,c_amt).value) or 0 if c_amt else 0
                totals["gw"] += to_number(bar.cell(r,c_bruto).value) or 0 if c_bruto else 0
                totals["nw"] += to_number(bar.cell(r,c_netto).value) or 0 if c_netto else 0
    package_type=""; package_qty=0
    if kem:
        headers={}
        for rr in range(1,min(kem.max_row,8)+1):
            h={clean_text(kem.cell(rr,c).value).upper():c for c in range(1,kem.max_column+1) if clean_text(kem.cell(rr,c).value)}
            if "KODE KEMASAN" in h or "JENIS KEMASAN" in h or "KEMASAN" in h:
                headers=h; break
        ctype=headers.get("KODE KEMASAN") or headers.get("JENIS KEMASAN") or headers.get("KEMASAN")
        cqty=headers.get("JUMLAH KEMASAN") or headers.get("JUMLAH") or headers.get("QTY")
        if ctype and cqty:
            for rr in range(1,kem.max_row+1):
                t=clean_text(kem.cell(rr,ctype).value)
                q=to_number(kem.cell(rr,cqty).value)
                if t and q is not None and t.upper() not in {"KODE KEMASAN","KEMASAN"}:
                    package_type=t; package_qty=int(q)
    return {"document_type":"draft_exim","company_sender":clean_text(sender),"company_receiver":clean_text(receiver),"invoice_no":clean_text(d.get("380")),"packing_list_no":clean_text(d.get("217")),"surat_jalan":clean_text(d.get("640")),"items":items,"total_cif":json_num(totals["cif"]),"total_gw":json_num(totals["gw"]),"total_nw":json_num(totals["nw"]),"package_type":package_type,"package_quantity":package_qty}
