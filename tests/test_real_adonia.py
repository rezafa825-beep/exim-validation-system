import sys
sys.path.insert(0,'../backend')
from parsers.excel_parser import open_book, detect_document_sheets
from parsers.table_parser import parse_pl

PATH='/mnt/data/10. CPMI-2026-01169 CP PL.xlsx'
wb=open_book(PATH)

def test_sheet_detection():
    kinds={name:dtype for name,dtype,_ in detect_document_sheets(wb)}
    assert kinds['PL-01169']=='packing_list'
    assert kinds['INV-01169']=='invoice'
    assert kinds['SJ-01633']=='surat_jalan'

def test_adonia_pl_subtotals():
    mapping={
      'ITEM_CODE':{'primary':'MATERIAL CODE','alternatives':['SKU']},
      'ITEM_NAME':{'primary':'ITEM NAME','alternatives':['DESCRIPTION']},
      'QUANTITY':{'primary':'QTY','alternatives':['QUANTITY']},
      'GROSS_WEIGHT':{'primary':'GW','alternatives':['GROSS WT']},
      'NET_WEIGHT':{'primary':'NW','alternatives':['NET WT']},
      'PACKAGE':{'primary':'KEMASAN','alternatives':['PACKAGE']},
      'PACKING_LIST_NO':{'primary':'INVOICE NO','alternatives':['PACKING LIST NO']},
    }
    data=parse_pl(wb,mapping,{'aggregation_labels':'TOTAL;SUBTOTAL;GRAND TOTAL'},'PL-01169')
    assert len(data['items'])==20
    assert data['total_gw']==8.76
    assert data['total_nw']==5.4
    assert data['package_type']=='CT'
    assert data['package_quantity']==2
    assert data['packing_list_no']=='CPMI-2026-01169'
