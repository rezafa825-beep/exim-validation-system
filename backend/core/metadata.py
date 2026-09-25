import re
from core.utils import clean_text


def _cells(ws, max_rows=20):
    for row in ws.iter_rows(min_row=1, max_row=min(ws.max_row,max_rows), values_only=True):
        yield [clean_text(v) for v in row]


def find_inline_value(ws, labels):
    labels=[x.upper() for x in labels]
    for row in _cells(ws):
        for i,v in enumerate(row):
            up=v.upper()
            for label in labels:
                if up.startswith(label):
                    rest=v[len(label):].lstrip(' :#')
                    if rest:
                        # Document numbers are usually the first token after the label.
                        m=re.search(r'([A-Z0-9][A-Z0-9._/-]{3,})', rest, re.I)
                        return m.group(1) if m else rest
                    if i+1<len(row) and row[i+1]: return row[i+1]
    return ''


def find_labeled_party(ws, label):
    label=label.upper()
    for row in _cells(ws):
        for i,v in enumerate(row):
            if v.upper().startswith(label):
                rest=v[len(label):].lstrip(' :')
                if rest: return rest
                # Common merged-cell layout: value is two columns later.
                for j in range(i+1,min(i+4,len(row))):
                    if row[j] and not row[j].upper().startswith(('BILL TO','SHIP TO','SHIPPED BY','BILL TO ADDRESS','SHIP TO ADDRESS')):
                        return row[j]
    return ''


def find_party_block(ws, labels):
    labels=[x.upper() for x in labels]
    for r in range(1, min(ws.max_row, 20)+1):
        for c in range(1, ws.max_column+1):
            raw=ws.cell(r,c).value
            v=clean_text(raw)
            if not v:
                continue
            up=v.upper()
            if any(up.startswith(label) for label in labels) and not any(up.startswith(label + ' ADDRESS') for label in labels):
                # Inline/merged-cell format: LABEL : COMPANY\nADDRESS.
                raw_text=str(raw).strip() if raw is not None else ''
                rest=''
                for label in labels:
                    if raw_text.upper().startswith(label):
                        tail=raw_text[len(label):].lstrip(' :')
                        lines=[x.strip() for x in tail.splitlines() if x.strip()]
                        rest=lines[0] if lines else ''
                        break
                if not rest:
                    rest=v.split(':',1)[1].strip() if ':' in v else ''
                if not rest:
                    for label in labels:
                        if up.startswith(label) and len(v) > len(label):
                            rest=v[len(label):].strip(' :')
                            break
                if rest:
                    return rest.split('\n')[0].strip()
                # Typical layout: LABEL in column A, company in column C.
                for cc in range(c+1, min(ws.max_column, c+4)+1):
                    candidate=clean_text(ws.cell(r,cc).value)
                    if candidate:
                        return candidate.split('\n')[0].strip()
                # Fallback: next row, but prefer a company-like value over an address.
                candidates=[]
                for rr in range(r+1, min(ws.max_row, r+4)+1):
                    for cc in range(1, min(ws.max_column, c+4)+1):
                        candidate=clean_text(ws.cell(rr,cc).value)
                        if candidate:
                            candidates.append(candidate.split('\n')[0].strip())
                for candidate in candidates:
                    if re.match(r'^(PT\.?|CV\.?|UD\s)', candidate.upper()):
                        return candidate
                if candidates:
                    return candidates[0]
    return ''


def find_company_header(ws):
    for r in range(1, min(ws.max_row, 6)+1):
        for c in range(1, min(ws.max_column, 5)+1):
            v=clean_text(ws.cell(r,c).value)
            if v and re.match(r'^(PT\.?|CV\.?|UD\s)', v.upper()):
                return v.split('\n')[0].strip()
    return ''


def extract_parties(ws):
    sender=find_company_header(ws)
    receiver=find_party_block(ws,['CONSIGNEE','SHIP TO'])
    return {
        'company_sender': sender,
        'company_receiver': receiver,
    }
