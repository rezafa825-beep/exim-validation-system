from .database import get_conn, init_db


def seed():
    init_db()
    conn = get_conn()
    customers = [
        ("PT. SHOETOWN LIGUNG INDONESIA", "SHOETOWN LIGUNG INDONESIA"),
        ("PT. YIH QUAN FOOTWEAR INDONESIA", "YIH QUAN FOOTWEAR INDONESIA"),
        ("PT. ADONIA FOOTWEAR INDONESIA", "ADONIA FOOTWEAR INDONESIA"),
    ]
    for name, norm in customers:
        conn.execute("INSERT OR IGNORE INTO customers(customer_name, normalized_name) VALUES (?,?)", (name, norm))
    conn.commit()
    mapping = {
        "SHOETOWN LIGUNG INDONESIA": {
            "invoice": {"INVOICE_NUMBER":"INVOICE NO","ITEM_CODE":"STYLE","ITEM_NAME":"ITEM NAME","QUANTITY":"QTY","AMOUNT":"AMOUNT","SURAT_JALAN":"SURAT"},
            "packing_list": {"PACKING_LIST_NO":"INVOICE NO","ITEM_CODE":"STYLE","ITEM_NAME":"ITEM NAME","QUANTITY":"QTY","GROSS_WEIGHT":"GW","NET_WEIGHT":"NW","PACKAGE":"KEMASAN"},
        },
        "YIH QUAN FOOTWEAR INDONESIA": {
            "invoice": {"INVOICE_NUMBER":"INVOICE NO","ITEM_CODE":"SKU","ITEM_NAME":"ITEM NAME","QUANTITY":"QTY","AMOUNT":"AMOUNT","SURAT_JALAN":"SURAT"},
            "packing_list": {"PACKING_LIST_NO":"INVOICE NO","ITEM_CODE":"SKU","ITEM_NAME":"ITEM NAME","QUANTITY":"TOTAL QTY","GROSS_WEIGHT":"GW","NET_WEIGHT":"NW","PACKAGE":"KEMASAN"},
        },
        "ADONIA FOOTWEAR INDONESIA": {
            "invoice": {"INVOICE_NUMBER":"INVOICE NO","ITEM_CODE":"MATERIAL CODE","ITEM_NAME":"ITEM NAME","QUANTITY":"QTY","AMOUNT":"AMOUNT (IDR)","SURAT_JALAN":"SURAT JALAN"},
            "packing_list": {"PACKING_LIST_NO":"INVOICE NO","ITEM_CODE":"MATERIAL CODE","ITEM_NAME":"ITEM NAME","QUANTITY":"QTY","GROSS_WEIGHT":"GW","NET_WEIGHT":"NW","PACKAGE":"KEMASAN"},
        },
    }
    aliases = {
        "INVOICE_NUMBER": ["INVOICE NO","INVOICE NUMBER","INVOICE"],
        "ITEM_CODE": ["SKU","STYLE","MATERIAL CODE","PRODUCT CODE","ARTICLE"],
        "ITEM_NAME": ["ITEM NAME","DESCRIPTION","DESC"],
        "QUANTITY": ["QTY","QUANTITY","JUMLAH","TOTAL QTY"],
        "AMOUNT": ["AMOUNT"],
        "SURAT_JALAN": ["SURAT","SURAT JALAN"],
        "GROSS_WEIGHT": ["GW","GROSS WT","GROSS WEIGHT"],
        "NET_WEIGHT": ["NW","NET WT","NET WEIGHT"],
        "PACKAGE": ["KEMASAN","PACKAGE","PACKAGE TYPE"],
    }
    for norm, docs in mapping.items():
        row = conn.execute("SELECT id FROM customers WHERE normalized_name=?", (norm,)).fetchone()
        cid = row[0]
        for dtype, fields in docs.items():
            for field, header in fields.items():
                alt = ";".join([a for a in aliases.get(field, []) if a != header])
                exists = conn.execute("SELECT 1 FROM customer_mappings WHERE customer_id=? AND document_type=? AND standard_field=?", (cid,dtype,field)).fetchone()
                if not exists:
                    conn.execute("INSERT INTO customer_mappings(customer_id,document_type,standard_field,primary_header,alternative_headers) VALUES (?,?,?,?,?)", (cid,dtype,field,header,alt))
        exists = conn.execute("SELECT 1 FROM row_rules WHERE customer_id=? AND document_type='packing_list'", (cid,)).fetchone()
        if not exists:
            conn.execute("INSERT INTO row_rules(customer_id,document_type,item_identifier,aggregation_labels,continue_after_aggregation) VALUES (?,?,?,?,?)", (cid,"packing_list","ITEM NAME","TOTAL;SUBTOTAL;GRAND TOTAL",1))
    conn.commit()
    conn.close()

if __name__ == "__main__":
    seed()
