from openpyxl import load_workbook, Workbook
import os


def _open_xls(path):
    """Read legacy .xls values into an openpyxl-like workbook for the existing parser."""
    import xlrd
    source = xlrd.open_workbook(path, on_demand=True)
    wb = Workbook()
    wb.remove(wb.active)
    for sheet in source.sheets():
        ws = wb.create_sheet(sheet.name)
        for r in range(sheet.nrows):
            for c in range(sheet.ncols):
                value = sheet.cell_value(r, c)
                if value != "":
                    ws.cell(r + 1, c + 1).value = value
    return wb


def open_book(path):
    if os.path.splitext(path)[1].lower() == ".xls":
        return _open_xls(path)
    return load_workbook(path, data_only=True, read_only=False)


def _sheet_text(ws, max_rows=60):
    vals=[]
    for row in ws.iter_rows(min_row=1, max_row=min(ws.max_row,max_rows), values_only=True):
        vals.extend(str(x).upper() for x in row if x is not None)
    return " | ".join(vals)


def detect_sheet_type(ws):
    text=_sheet_text(ws)
    scores={"draft_exim":0,"packing_list":0,"invoice":0,"surat_jalan":0,"unknown":0}
    if all(x in text for x in ["ENTITAS","DOKUMEN","BARANG"]): scores["draft_exim"]+=100
    if "PACKING LIST" in text: scores["packing_list"]+=30
    if all(x in text for x in ["GW","NW","KEMASAN"]): scores["packing_list"]+=15
    if "INVOICE" in text and "AMOUNT" in text: scores["invoice"]+=30
    if "SURAT JALAN" in text: scores["surat_jalan"]+=30
    # Strong table signatures
    if "ITEM NAME" in text and "QTY" in text and "MATERIAL CODE" in text: 
        scores["invoice"]+=5
        scores["packing_list"]+=5
    best=max((k for k in scores if k!="unknown"), key=lambda k:scores[k])
    return best if scores[best]>0 else "unknown", scores


def detect_document_type(wb):
    """Backward-compatible workbook-level detector. Draft wins if present; otherwise highest sheet score."""
    totals={"draft_exim":0,"packing_list":0,"invoice":0,"surat_jalan":0}
    for ws in wb.worksheets:
        dtype,scores=detect_sheet_type(ws)
        for k in totals: totals[k]+=scores.get(k,0)
    return max(totals,key=totals.get), totals


def detect_document_sheets(wb):
    """Return document-bearing sheets, while recognizing a CEISA Draft workbook as a workbook-level document."""
    names={ws.title.upper() for ws in wb.worksheets}
    out=[]
    if {"ENTITAS","DOKUMEN","BARANG"}.issubset(names):
        out.append(("__WORKBOOK__", "draft_exim", {"draft_exim":1000,"packing_list":0,"invoice":0,"surat_jalan":0,"unknown":0}))
    out.extend((ws.title,)+detect_sheet_type(ws) for ws in wb.worksheets)
    return out


def find_header_row(ws, required_headers, max_rows=40):
    req={h.upper() for h in required_headers}
    best=None
    for r in range(1,min(ws.max_row,max_rows)+1):
        row={str(ws.cell(r,c).value).strip().upper() for c in range(1,ws.max_column+1) if ws.cell(r,c).value is not None}
        score=len(req & row)
        if best is None or score>best[0]: best=(score,r)
    return best[1] if best and best[0] else None
