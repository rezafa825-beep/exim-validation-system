from core.utils import clean_text, norm_name, norm_code, to_number, json_num
from core.metadata import extract_parties, find_inline_value


def locate_header(ws, desired):
    desired={x.upper() for x in desired}
    best=(0,None,{})
    for r in range(1,min(ws.max_row,40)+1):
        m={clean_text(ws.cell(r,c).value).upper():c for c in range(1,ws.max_column+1) if clean_text(ws.cell(r,c).value)}
        score=len(desired & set(m))
        if score>best[0]: best=(score,r,m)
    return best[1],best[2]


def resolve_col(headers, mapping, field):
    target=mapping.get(field,{})
    candidates=[target.get("primary","")]+target.get("alternatives",[])
    # Prefer exact header matches. Then accept common qualified headers such as
    # QTY (PAIRS) when the Master field is QTY, without doing broad fuzzy guessing.
    for h in candidates:
        if h and h.upper() in headers:
            return headers[h.upper()]
    for h in candidates:
        if not h: continue
        hu=h.upper().strip()
        qualified=[(key,col) for key,col in headers.items() if key.startswith(hu) and key[len(hu):].lstrip().startswith(("(","-",":","/"))]
        if len(qualified)==1:
            return qualified[0][1]
    return None


def is_aggregation(value, labels):
    return clean_text(value).upper() in {x.strip().upper() for x in labels.split(';') if x.strip()}


def parse_invoice(wb, mapping, sheet_name=None):
    # choose sheet with strongest mapped-header match
    candidates=[]
    desired=[v["primary"] for v in mapping.values() if v.get("primary")]
    sheets=[wb[sheet_name]] if sheet_name else wb.worksheets
    for ws in sheets:
        r,h=locate_header(ws,desired+['ITEM NAME','QTY','AMOUNT'])
        candidates.append((len(h),ws,r,h))
    _,ws,r,headers=max(candidates,key=lambda x:x[0])
    c_code=resolve_col(headers,mapping,"ITEM_CODE"); c_name=resolve_col(headers,mapping,"ITEM_NAME"); c_qty=resolve_col(headers,mapping,"QUANTITY"); c_amt=resolve_col(headers,mapping,"AMOUNT"); c_sj=resolve_col(headers,mapping,"SURAT_JALAN"); c_inv=resolve_col(headers,mapping,"INVOICE_NUMBER")
    items=[]; total=0; surat=""; inv=""
    for rr in range(r+1,ws.max_row+1):
        name=ws.cell(rr,c_name).value if c_name else None
        if clean_text(name):
            code=clean_text(ws.cell(rr,c_code).value) if c_code else ""
            qty=to_number(ws.cell(rr,c_qty).value) if c_qty else None
            amt=to_number(ws.cell(rr,c_amt).value) if c_amt else None
            items.append({"sequence":len(items)+1,"item_code":code,"item_name":clean_text(name),"quantity":json_num(qty),"amount":json_num(amt)})
            total += amt or 0
            if c_sj and clean_text(ws.cell(rr,c_sj).value): surat=clean_text(ws.cell(rr,c_sj).value)
            if c_inv and clean_text(ws.cell(rr,c_inv).value): inv=clean_text(ws.cell(rr,c_inv).value)
    # Metadata labels are often inline in a merged cell, e.g. "INVOICE NO : CPMI-...".
    if not inv:
        inv=find_inline_value(ws,["INVOICE NO","INVOICE NUMBER"])
    if not surat:
        # The mapped SURAT JALAN field is expected in the item table; otherwise try an inline label.
        surat=find_inline_value(ws,["SURAT JALAN"])
    parties=extract_parties(ws)
    return {"document_type":"invoice","invoice_no":inv,"surat_jalan":surat,"items":items,"total_cif":json_num(total),**parties}


def parse_pl(wb, mapping, row_rule, sheet_name=None):
    candidates=[]
    desired=[v["primary"] for v in mapping.values() if v.get("primary")]
    sheets=[wb[sheet_name]] if sheet_name else wb.worksheets
    for ws in sheets:
        r,h=locate_header(ws,desired+['ITEM NAME','GW','NW','KEMASAN'])
        bonus=sum(1 for x in ['KEMASAN','GW','NW','WEIGHT'] if x in h)
        candidates.append((len(h)+bonus*5,ws,r,h))
    _,ws,r,headers=max(candidates,key=lambda x:x[0])

    # Multi-row headers are common in PL files (e.g. KEMASAN/CT and WEIGHT/GW/NW).
    # Merge semantic headers from the detected header row and the following two rows.
    merged=dict(headers)
    for rr in range(r+1, min(ws.max_row, r+2)+1):
        for c in range(1, ws.max_column+1):
            v=clean_text(ws.cell(rr,c).value).upper()
            if v and v not in merged:
                merged[v]=c
    headers=merged

    c_code=resolve_col(headers,mapping,"ITEM_CODE"); c_name=resolve_col(headers,mapping,"ITEM_NAME"); c_qty=resolve_col(headers,mapping,"QUANTITY"); c_gw=resolve_col(headers,mapping,"GROSS_WEIGHT"); c_nw=resolve_col(headers,mapping,"NET_WEIGHT"); c_pkg=resolve_col(headers,mapping,"PACKAGE"); c_plno=resolve_col(headers,mapping,"PACKING_LIST_NO")
    items=[]; total_gw=0; total_nw=0; total_qty=0; plno=""; package_type=""; package_qty=0
    labels=(row_rule or {}).get("aggregation_labels","TOTAL;SUBTOTAL;GRAND TOTAL")
    package_groups=0
    for rr in range(r+1,ws.max_row+1):
        name=ws.cell(rr,c_name).value if c_name else None
        if is_aggregation(name,labels):
            continue
        if not clean_text(name):
            continue
        code=clean_text(ws.cell(rr,c_code).value) if c_code else ""
        qty=to_number(ws.cell(rr,c_qty).value) if c_qty else None
        gw=to_number(ws.cell(rr,c_gw).value) if c_gw else None
        nw=to_number(ws.cell(rr,c_nw).value) if c_nw else None
        items.append({"sequence":len(items)+1,"item_code":code,"item_name":clean_text(name),"quantity":json_num(qty),"gross_weight":json_num(gw),"net_weight":json_num(nw)})
        total_qty += qty or 0; total_gw += gw or 0; total_nw += nw or 0
        if c_pkg:
            raw=clean_text(ws.cell(rr,c_pkg).value)
            # In this PL structure, package type is supplied in the secondary header row,
            # while package quantity appears once at the beginning of each item group.
            if raw:
                q=to_number(raw)
                if q is not None:
                    package_qty += int(q)
        if c_plno and clean_text(ws.cell(rr,c_plno).value): plno=clean_text(ws.cell(rr,c_plno).value)

    if c_pkg:
        # Read package type from the secondary header row (e.g. CT under KEMASAN).
        for rr in range(r+1, min(ws.max_row, r+2)+1):
            raw=clean_text(ws.cell(rr,c_pkg).value)
            if raw and to_number(raw) is None and raw.upper() not in {"KEMASAN","PACKAGE"}:
                package_type=raw
                break
    if not plno:
        plno=find_inline_value(ws,["PACKING LIST NO","PL NO","INVOICE NO"])
    parties=extract_parties(ws)
    return {"document_type":"packing_list","packing_list_no":plno,"items":items,"total_gw":json_num(total_gw),"total_nw":json_num(total_nw),"package_type":package_type,"package_quantity":package_qty,**parties}
