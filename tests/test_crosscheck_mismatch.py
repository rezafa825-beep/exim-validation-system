from core.crosscheck import crosscheck


def base():
    items=[{"sequence":1,"item_code":"ABC-001","item_name":"Upper Black","quantity":10}]
    return (
        {"company_sender":"PT A","company_receiver":"PT B","invoice_no":"INV-1","surat_jalan":"SJ-1","total_cif":100,"items":items},
        {"company_sender":"PT A","company_receiver":"PT B","packing_list_no":"PL-1","total_gw":12,"total_nw":10,"package_type":"CT","package_quantity":1,"items":[{"sequence":1,"item_code":"ABC-001","item_name":"Upper Black","quantity":10}]},
        {"company_sender":"PT A","company_receiver":"PT B","invoice_no":"INV-1","packing_list_no":"PL-1","surat_jalan":"SJ-1","total_cif":100,"total_gw":12,"total_nw":10,"package_type":"CT","package_quantity":1,"items":[{"sequence":1,"item_code":"ABC-001","item_name":"Upper Black","quantity":10}]}
    )


def test_item_name_difference_is_note_only():
    inv,pl,draft=base(); inv['items'][0]['item_name']='Different Name'
    r=crosscheck(inv,pl,draft)
    assert r['checks']['item_name']=='NOT MATCH'
    assert r['overall_status']=='MATCH'
    assert r['mismatches']==[]
    assert r['notes']


def test_quantity_difference_is_decisive():
    inv,pl,draft=base(); draft['items'][0]['quantity']=11
    r=crosscheck(inv,pl,draft)
    assert r['checks']['quantity']=='NOT MATCH'
    assert r['overall_status']=='NOT MATCH'
    assert 'quantity' in r['mismatches']


def test_item_order_difference_is_decisive():
    inv,pl,draft=base(); draft['items'][0]['item_code']='XYZ-999'
    r=crosscheck(inv,pl,draft)
    assert r['checks']['item_order']=='NOT MATCH'
    assert r['checks']['item_code']=='NOT MATCH'
    assert r['overall_status']=='NOT MATCH'
