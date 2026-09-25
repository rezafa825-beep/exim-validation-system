from parsers.excel_parser import open_book, detect_document_sheets
from parsers.draft_exim_parser import parse_draft
from parsers.table_parser import parse_invoice, parse_pl
from core.customer import find_customer, get_mapping, get_row_rule
from core.crosscheck import crosscheck
from database.seed import seed

PL_FILE = '/mnt/data/10. CPMI-2026-01169 CP PL.xlsx'
DRAFT_FILE = '/mnt/data/10. DRAFT DOC ADONIA 01169 20 Update No AJU Revisi 1512.xlsx'


def test_adonia_end_to_end_real_files():
    seed()
    pl_wb = open_book(PL_FILE)
    draft_wb = open_book(DRAFT_FILE)

    draft = parse_draft(draft_wb)
    customer = find_customer(draft['company_receiver'])
    assert customer is not None

    records = detect_document_sheets(pl_wb)
    inv_sheet = next(x for x in records if x[1] == 'invoice')
    pl_sheet = next(x for x in records if x[1] == 'packing_list')

    invoice = parse_invoice(pl_wb, get_mapping(customer['id'], 'invoice'), inv_sheet[0])
    packing = parse_pl(pl_wb, get_mapping(customer['id'], 'packing_list'), get_row_rule(customer['id']), pl_sheet[0])
    result = crosscheck(invoice, packing, draft)

    assert result['overall_status'] == 'MATCH'
    assert result['mismatches'] == []
    assert all(v == 'MATCH' for v in result['checks'].values())
    assert len(result['items']) == 20
    assert invoice['total_cif'] == draft['total_cif'] == 3078716.09
    assert packing['total_gw'] == draft['total_gw'] == 8.76
    assert packing['total_nw'] == draft['total_nw'] == 5.4
    assert packing['package_type'] == draft['package_type'] == 'CT'
    assert packing['package_quantity'] == draft['package_quantity'] == 2
