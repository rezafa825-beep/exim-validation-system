from copy import deepcopy
from core.crosscheck import crosscheck


def base():
    items=[
        {"sequence":1,"item_code":"ABC-001","item_name":"Upper Black","quantity":10},
        {"sequence":2,"item_code":"ABC-002","item_name":"Upper White","quantity":20},
    ]
    return (
        {"company_sender":"PT A","company_receiver":"PT B","invoice_no":"INV-1","surat_jalan":"SJ-1","total_cif":100,"items":deepcopy(items)},
        {"company_sender":"PT A","company_receiver":"PT B","packing_list_no":"PL-1","total_gw":12,"total_nw":10,"package_type":"CT","package_quantity":2,"items":deepcopy(items)},
        {"company_sender":"PT A","company_receiver":"PT B","invoice_no":"INV-1","packing_list_no":"PL-1","surat_jalan":"SJ-1","total_cif":100,"total_gw":12,"total_nw":10,"package_type":"CT","package_quantity":2,"items":deepcopy(items)}
    )


def test_all_match():
    assert crosscheck(*base())["overall_status"] == "MATCH"


def test_each_decisive_header_field_causes_not_match():
    fields=[
        ("company_receiver", "WRONG", "company"),
        ("invoice_no", "WRONG", "invoice_number"),
        ("packing_list_no", "WRONG", "packing_list_number"),
        ("surat_jalan", "WRONG", "surat_jalan"),
        ("total_cif", 101, "total_cif"),
        ("total_gw", 13, "total_gw"),
        ("total_nw", 11, "total_nw"),
        ("package_quantity", 3, "package"),
    ]
    for field,value,check in fields:
        inv,pl,draft=base()
        if field in inv: inv[field]=value
        elif field in pl: pl[field]=value
        else: draft[field]=value
        r=crosscheck(inv,pl,draft)
        assert r["checks"][check] == "NOT MATCH", field
        assert r["overall_status"] == "NOT MATCH", field


def test_missing_item_is_not_silently_ignored():
    inv,pl,draft=base(); draft["items"].pop()
    r=crosscheck(inv,pl,draft)
    assert r["checks"]["item_order"] == "NOT MATCH"
    assert r["overall_status"] == "NOT MATCH"


def test_item_name_only_does_not_fail_overall():
    inv,pl,draft=base(); pl["items"][0]["item_name"]="Different"
    r=crosscheck(inv,pl,draft)
    assert r["checks"]["item_name"] == "NOT MATCH"
    assert r["overall_status"] == "MATCH"
    assert r["mismatches"] == []


def test_item_code_cell_status_identifies_the_outlier():
    inv,pl,draft=base(); draft["items"][1]["item_code"]="WRONG"
    r=crosscheck(inv,pl,draft)
    row=r["items"][1]
    assert row["item_code_cell_status"]["invoice"] == "NOT MATCH"
    assert row["item_code_cell_status"]["pl"] == "NOT MATCH"
    assert row["item_code_cell_status"]["draft"] == "NOT MATCH"
