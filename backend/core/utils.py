import re
from decimal import Decimal, InvalidOperation


def clean_text(v):
    if v is None:
        return ""
    return re.sub(r"\s+", " ", str(v).strip())


def norm_company(v):
    s = clean_text(v).upper()
    s = re.sub(r"^PT\.?\s*", "", s)
    return s.strip()


def norm_code(v):
    return clean_text(v).upper()


def norm_name(v):
    return clean_text(v).upper()


def to_number(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float, Decimal)):
        return Decimal(str(v))
    s = clean_text(v).replace(" ", "")
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        # PL weights such as 3,87 are decimal comma.
        s = s.replace(",", ".")
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def json_num(v):
    if v is None:
        return None
    if isinstance(v, Decimal):
        return float(v) if v != v.to_integral_value() else int(v)
    return v
