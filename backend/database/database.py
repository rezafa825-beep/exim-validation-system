import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "exim.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT NOT NULL UNIQUE,
        normalized_name TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS customer_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        document_type TEXT NOT NULL,
        standard_field TEXT NOT NULL,
        primary_header TEXT,
        alternative_headers TEXT DEFAULT '',
        FOREIGN KEY(customer_id) REFERENCES customers(id)
    );
    CREATE TABLE IF NOT EXISTS row_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        document_type TEXT NOT NULL,
        item_identifier TEXT NOT NULL,
        aggregation_labels TEXT DEFAULT 'TOTAL;SUBTOTAL;GRAND TOTAL',
        continue_after_aggregation INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY(customer_id) REFERENCES customers(id)
    );
    CREATE TABLE IF NOT EXISTS validation_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        invoice_no TEXT,
        packing_list_no TEXT,
        surat_jalan TEXT,
        status TEXT,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(customer_id) REFERENCES customers(id)
    );
    CREATE TABLE IF NOT EXISTS validation_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        sequence INTEGER NOT NULL,
        result_json TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES validation_sessions(id)
    );
    """)
    conn.commit()
    conn.close()
