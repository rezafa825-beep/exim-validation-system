from database.database import get_conn
from core.utils import norm_company


def find_customer(name):
    norm = norm_company(name)
    conn = get_conn()
    row = conn.execute("SELECT * FROM customers WHERE normalized_name=? AND status='ACTIVE'", (norm,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_mapping(customer_id, document_type):
    conn = get_conn()
    rows = conn.execute("SELECT * FROM customer_mappings WHERE customer_id=? AND document_type=?", (customer_id,document_type)).fetchall()
    conn.close()
    return {r["standard_field"]: {"primary":r["primary_header"], "alternatives":[x for x in r["alternative_headers"].split(';') if x]} for r in rows}


def get_row_rule(customer_id, document_type="packing_list"):
    conn = get_conn()
    row = conn.execute("SELECT * FROM row_rules WHERE customer_id=? AND document_type=?", (customer_id,document_type)).fetchone()
    conn.close()
    return dict(row) if row else None
