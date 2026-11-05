# ============================================================
# DARB — Business name -> SSIC (ISIC4) section & division
# Codes follow GASTAT's National Classification (SSIC, Sep 2026).
# The keyword -> code assignment is a team-built rule set:
#   validate it on the manually checked 300-name sample before use.
#
# How a name is classified
#   1. Every rule that matches the name is collected (not only the first one).
#      Phrases (several words) are matched first and removed from the name,
#      so "تاجير سيارات" counts as rental only, not also as car trade.
#   2. Known combinations are resolved (see DOMINATES and FACTORY_PRODUCTS),
#      e.g. "مصنع" + "حلويات" = food manufacturing (C10), not a restaurant.
#   3. If what is left points to ONE section -> that section (+ division).
#      If it points to SEVERAL sections -> nothing is assigned, the name is
#      flagged "ambiguous" and the candidates are kept for review.
#   Nothing is guessed: every name gets an ssic_flag saying how sure we are.
#
# ssic_flag
#   ok               one section and one division
#   division_unclear section is clear, division is not (e.g. "مصنع" alone)
#   low_confidence   only a generic trading word ("تجاره") -> G46, unsure
#   ambiguous        rules from different sections match -> no code assigned
#   unclassified     no rule matches (incl. names with no Arabic letters)
# ============================================================
import re
import pandas as pd

def normalize(text: str) -> str:
    t = str(text)
    t = re.sub(r"[إأآا]", "ا", t)
    t = t.replace("ة", "ه").replace("ى", "ي")
    t = re.sub(r"[ًٌٍَُِّْـ]", "", t)          # diacritics + tatweel
    t = re.sub(r"[^؀-ۿ\s]", " ", t)
    return re.sub(r"\s+", " ", t).strip()

# (key, stems, section, division, label) — stems are matched on NORMALIZED text.
# Stem forms: "a b" = phrase | "x$" = exact word | "x" = a word starts with x
# Within ONE section, the rule listed first gives the division.
RULES = [
    # ---------- M: professional / legal / consulting ----------
    ("M69", ["محاماه", "محامي", "قانونيه", "محاسبه", "مراجعه حسابات"], "M", "69", "Legal & accounting"),
    ("M71", ["استشارات هندسيه", "هندسيه استشاريه", "مكتب هندسي"],     "M", "71", "Engineering consulting"),
    ("M73", ["دعايه", "اعلان", "تسويق"],                               "M", "73", "Advertising & marketing"),
    ("M74", ["تصميم", "تصوير", "ترجمه", "تخليص جمركي", "تخليص"],      "M", "74", "Other professional"),
    ("M70", ["استشارات", "استشاريه"],                                  "M", "70", "Management consulting"),

    # ---------- I: food service & accommodation ----------
    ("I56", ["مطعم", "مطاعم", "مقهي", "كافيه", "كوفي", "لتقديم", "اعاشه",
             "مطبخ", "بوفيه", "شاورما", "برجر", "بيتزا", "حلويات",
             "عصائر", "وجبات", "مشويات"],                              "I", "56", "Food & beverage service"),
    ("I55", ["فندق", "فنادق", "شقق مفروشه", "وحدات سكنيه مفروشه", "منتجع", "نزل"], "I", "55", "Accommodation"),

    # ---------- C: manufacturing ----------
    ("C",   ["مصنع", "مصانع", "للصناعه", "صناعات", "للصناعات"],       "C", "",   "Manufacturing"),
    ("C10", ["مخبز", "مخابز"],                                         "C", "10", "Bakery products"),
    ("C23", ["خرسانه", "طابوق", "بلك"],                                "C", "23", "Concrete & blocks"),
    ("C25", ["حداده", "المنيوم"],                                      "C", "25", "Metal workshops"),
    ("C16", ["نجاره"],                                                 "C", "16", "Carpentry / wood"),
    ("C14", ["خياط", "خياطه", "تفصيل"],                                "C", "14", "Tailoring / apparel"),

    # ---------- N77 / G45: rental, vehicles ----------
    ("N77", ["تاجير", "لتاجير"],                                       "N", "77", "Rental & leasing"),
    ("G45", ["معرض سيارات", "قطع غيار", "كهرباء سيارات", "سيارات", "بنشر",
             "غيار", "اطارات", "كفرات", "زيوت", "سمكره", "ميكانيكا"], "G", "45", "Motor vehicles trade & repair"),

    # ---------- N: events, security, travel, cleaning ----------
    ("N82", ["تنظيم المعارض", "معارض والمؤتمرات", "مؤتمرات", "تنظيم الحفلات", "لتنظيم"], "N", "82", "Events & business support"),
    ("N80", ["امن$", "امنيه", "حراسات", "امن والسلامه"],              "N", "80", "Security"),
    ("N79", ["سفر$", "سفريات", "سياحه", "سياحيه", "عمره"],            "N", "79", "Travel & tourism agencies"),
    ("N81", ["نظافه", "تنظيف", "مكافحه حشرات"],                       "N", "81", "Cleaning & pest control"),
    ("N78", ["استقدام", "توظيف"],                                      "N", "78", "Recruitment & staffing"),

    # ---------- J: ICT ----------
    ("J62", ["تقنيه المعلومات", "ذكاء اصطناعي", "برمجيات", "برمجه", "حاسب", "تطبيقات",
             "رقميه", "سحابيه", "تقنيه$", "تقنيات"],                   "J", "62", "Software & IT services"),
    ("J61", ["اتصالات", "انترنت"],                                     "J", "61", "Telecommunications"),
    ("J58", ["انتاج فني", "انتاج اعلامي", "نشر$", "اعلام$", "اعلاميه"], "J", "58", "Publishing & media"),

    # ---------- S: personal services, repair ----------
    ("S95", ["صيانه جوالات", "صيانه اجهزه"],                           "S", "95", "Repair of goods"),
    ("S96", ["كي ملابس", "مشغل", "صالون", "تجميل", "حلاقه", "حلاق", "سبا$", "مغسله"], "S", "96", "Personal services"),

    # ---------- F: construction (specialised works first, then buildings) ----------
    ("F43", ["ترميم", "ديكور", "سباكه", "كهرباء", "تكييف", "تبريد", "دهانات", "عزل", "مصاعد"], "F", "43", "Specialised construction"),
    ("F41", ["مقاولات", "مقاول", "انشاءات", "للبناء", "بناء$", "تشييد"], "F", "41", "Building construction"),

    # ---------- Q / P / R ----------
    ("Q86", ["مجمع طبي", "مركز طبي", "عياده", "عيادات", "طبي$", "طبيه", "اسنان", "علاج", "مختبر"], "Q", "86", "Health"),
    ("P85", ["تعليم", "تدريب", "اكاديميه", "معهد", "مدرسه", "روضه", "حضانه"], "P", "85", "Education"),
    ("R93", ["ترفيه", "رياضي", "رياضيه", "العاب", "نادي"],             "R", "93", "Sports & recreation"),

    # ---------- H: transport & logistics ----------
    ("H49", ["نقل"],                                                   "H", "49", "Land transport"),
    ("H52", ["شحن", "لوجستي", "لوجستيه"],                              "H", "52", "Freight & logistics"),
    ("H53", ["توصيل"],                                                 "H", "53", "Delivery / courier"),

    # ---------- L / K / B / A ----------
    ("L68", ["تطوير عقاري", "عقار", "عقارات", "عقاريه", "املاك"],     "L", "68", "Real estate"),
    ("K64", ["استثمار", "قابضه", "تمويل"],                             "K", "64", "Holding & investment"),
    ("B08", ["تعدين", "محاجر", "كساره"],                               "B", "08", "Mining & quarrying"),
    ("A01", ["مزرعه", "مزارع", "زراعيه", "مشتل", "دواجن", "مواشي"],   "A", "01", "Agriculture"),

    # ---------- G46 / G47: wholesale & retail ----------
    ("G46",       ["توريد", "توريدات", "جمله"],                       "G", "46", "Wholesale & supply"),
    ("G47_food",  ["مواد غذائيه", "بقاله", "تموينات", "سوبرماركت", "اسواق", "خضار", "فواكه",
                   "ملحمه", "لحوم", "تمور", "الغذائيه", "المشروبات"], "G", "47", "Retail: food"),
    ("G47_fashion", ["ملابس", "عبايات", "عبايه", "ازياء", "اقمشه", "احذيه", "مجوهرات",
                     "عطور", "عطورات"],                                "G", "47", "Retail: fashion & perfume"),
    ("G47_furniture", ["اثاث", "مفروشات", "موكيت", "ستائر"],          "G", "47", "Retail: furniture"),
    ("G47_other", ["سوق", "زهور", "هدايا", "مكتبه", "قرطاسيه", "جوالات", "الكترونيات",
                   "بصريات", "نظارات", "صيدليه", "اعلاف"],             "G", "47", "Retail: other goods"),
    # goods words: "مستلزمات طبيه" = selling medical supplies, not a clinic
    ("G47_goods", ["مواد بناء", "مستلزمات", "معدات", "ادوات", "مستودع"], "G", "47", "Retail & wholesale of goods"),
    # place words: only used when nothing else matches ("محل حلاقه" is a barber, not a shop)
    ("G47_place", ["محل$", "محلات", "معرض", "ركن$", "متجر"],          "G", "47", "Shop (activity not stated)"),
]

# Generic trading names ("…للتجاره" / "…التجاريه") with no specific activity
GENERIC_TRADE = ["للتجاره", "التجاريه", "تجاره", "تجاري"]

# When both rules match, the first one wins and the others are dropped.
# Every pair here is a known combination, not a guess:
DOMINATES = {
    # a factory makes the goods it names (division chosen from FACTORY_PRODUCTS)
    "C":   {"I56", "C10", "C14", "C16", "C23", "C25", "F43", "G46", "G47_food", "G47_fashion",
            "G47_furniture", "G47_other", "G47_goods", "G47_place"},
    # renting cars / equipment is rental, not trade
    "N77": {"G45", "G47_goods", "G47_place"},
    # renting property: furnished units = accommodation, real estate = real estate
    "I55": {"N77"},
    "L68": {"N77"},
    # "مستلزمات طبيه" / "ادوات تجميل" / "معدات زراعيه" ... = selling those goods
    "G47_goods": {"Q86", "S96", "A01", "R93", "J62", "J61", "F43", "P85"},
    # "تصميم تطبيقات" = software; "اكاديميه رياضيه" = education; "عيادات تجميل" = health
    "J62": {"M74"},
    "P85": {"R93"},
    "Q86": {"S96"},
}

# The product a factory makes -> manufacturing division (first match wins)
FACTORY_PRODUCTS = [
    (["مياه", "عصائر", "مشروبات", "المشروبات"],                         "11"),
    (["حلويات", "مخبز", "مخابز", "تمور", "غذائيه", "الغذائيه", "لحوم", "البان", "اعلاف"], "10"),
    (["ملابس", "خياطه", "عبايات", "ازياء"],                              "14"),
    (["اقمشه", "نسيج", "سجاد"],                                          "13"),
    (["اثاث", "مفروشات"],                                                "31"),
    (["نجاره", "اخشاب", "خشب"],                                          "16"),
    (["ورق", "كرتون"],                                                   "17"),
    (["طباعه"],                                                          "18"),
    (["ادويه", "دوائيه"],                                                "21"),
    (["كيماويات", "كيميائيه", "دهانات", "منظفات", "عطور", "عطورات"],    "20"),
    (["بلاستيك", "بلاستيكيه", "مطاط"],                                   "22"),
    (["خرسانه", "طابوق", "بلك", "رخام", "زجاج", "اسمنت"],               "23"),
    (["حديد", "حداده", "المنيوم", "معادن", "معدنيه"],                    "25"),
    (["كهربائيه", "كهرباء", "كابلات"],                                   "27"),
]

PREFIXES = ("وال", "بال", "فال", "لل", "ال", "و", "ل")

RULE_INFO = {key: (sec, div, lab) for key, _stems, sec, div, lab in RULES}
RULE_ORDER = {key: i for i, (key, *_rest) in enumerate(RULES)}

def _index(groups):
    """groups: [(value, stems)] -> (phrases, starts-with index, exact-word index)."""
    phrases, starts, exact = [], {}, {}
    for value, stems in groups:
        for s in stems:
            if s.endswith("$"):
                exact.setdefault(normalize(s[:-1]), []).append(value)
            elif " " in s:
                phrases.append((normalize(s), value))
            else:
                starts.setdefault(normalize(s), []).append(value)
    return phrases, starts, exact

RULE_PHRASES, RULE_STARTS, RULE_EXACT = _index([(key, stems) for key, stems, *_ in RULES])
_, GENERIC_STARTS, _ = _index([("G46", GENERIC_TRADE)])
_, PRODUCT_STARTS, _ = _index([(div, stems) for stems, div in FACTORY_PRODUCTS])
PRODUCT_ORDER = {div: i for i, (_s, div) in enumerate(FACTORY_PRODUCTS)}

def _forms(t):
    """Every word, with and without its prefix (و / ال / لل ...)."""
    out = set()
    for w in t.split():
        out.add(w)
        for p in PREFIXES:
            if w.startswith(p) and len(w) - len(p) >= 2:
                out.add(w[len(p):])
    return out

def _lookup(forms, starts, exact=None):
    """Values whose stem a word starts with (or, for 'x$' stems, that equal the word)."""
    found = set()
    for f in forms:
        if exact and f in exact:
            found.update(exact[f])
        for k in range(2, len(f) + 1):
            if f[:k] in starts:
                found.update(starts[f[:k]])
    return found

def _find_hits(t):
    """All rules that match. Phrases first; a matched phrase is removed from the text."""
    hits = set()
    for phrase, key in RULE_PHRASES:
        if phrase in t:
            hits.add(key)
            t = t.replace(phrase, " ")
    forms = _forms(t)
    return hits | _lookup(forms, RULE_STARTS, RULE_EXACT), forms

def _resolve(hits):
    """Apply the known combinations, then drop shop words if anything else matched."""
    hits = set(hits)
    for winner, losers in DOMINATES.items():
        if winner in hits:
            hits -= losers
    if len(hits) > 1:
        hits.discard("G47_place")
    return hits

RESULT = ["ssic_section", "ssic_division", "ssic_label", "ssic_confidence", "ssic_flag", "ssic_candidates"]
UNCLASSIFIED = ("", "", "", "none", "unclassified", "")

def classify_tuple(name: str) -> tuple:
    """Same as classify(), as a plain tuple in the order of RESULT (fast, for millions of names)."""
    t = normalize(name)
    if not t:
        return UNCLASSIFIED                                 # empty, or no Arabic letters
    raw_hits, forms = _find_hits(t)
    hits = sorted(_resolve(raw_hits), key=RULE_ORDER.get)

    if not hits:
        if _lookup(forms, GENERIC_STARTS):
            return ("G", "46", "General trading", "low", "low_confidence", "")
        return UNCLASSIFIED

    candidates = "|".join(RULE_INFO[k][0] + RULE_INFO[k][1] for k in hits)
    if len({RULE_INFO[k][0] for k in hits}) > 1:
        return ("", "", "", "none", "ambiguous", candidates)

    section, division, label = RULE_INFO[hits[0]]
    if hits[0] == "C":                                      # a factory: which product?
        products = _lookup(_forms(t), PRODUCT_STARTS)       # whole name, phrases included
        division = min(products, key=PRODUCT_ORDER.get) if products else ""
    confidence = "high" if len(hits) == 1 and hits[0] != "G47_place" else "medium"
    flag = "ok" if division else "division_unclear"
    return (section, division, label, confidence, flag, candidates)

def classify(name: str) -> pd.Series:
    return pd.Series(classify_tuple(name), index=RESULT)

# ------------------------------------------------------------
# Quick self-test (run in the notebook before using the classifier).
# Each name -> (expected section, expected division, expected flag)
# ------------------------------------------------------------
EXAMPLES = {
    "مطعم الذواقة للوجبات السريعة":        ("I", "56", "ok"),
    "مصنع حلويات الشرق":                   ("C", "10", "ok"),
    "مصنع الخليج للمياه":                   ("C", "11", "ok"),
    "مصنع الرياض":                          ("C", "",   "division_unclear"),
    "مخبز الأصالة":                         ("C", "10", "ok"),
    "شركة تأجير سيارات النخبة":            ("N", "77", "ok"),
    "معرض سيارات الوفاء":                  ("G", "45", "ok"),
    "مؤسسة المستلزمات الطبية":             ("G", "47", "ok"),
    "مجمع عيادات التجميل":                  ("Q", "86", "ok"),
    "محل حلاقة الأمير":                     ("S", "96", "ok"),
    "محل أبو فهد":                          ("G", "47", "ok"),
    "مؤسسة عبدالله للتجارة":               ("G", "46", "low_confidence"),
    "مؤسسة المقاولات والنقل":              ("",  "",   "ambiguous"),
    "Blue Sky Company":                     ("",  "",   "unclassified"),
    "مؤسسة سالم محمد العتيبي":             ("",  "",   "unclassified"),
}

def self_test():
    wrong = []
    for name, expected in EXAMPLES.items():
        r = classify(name)
        got = (r["ssic_section"], r["ssic_division"], r["ssic_flag"])
        if got != expected:
            wrong.append((name, expected, got, r["ssic_candidates"]))
    for name, expected, got, cand in wrong:
        print(f"WRONG: {name} | expected {expected} | got {got} | candidates {cand}")
    print(f"Self-test: {len(EXAMPLES) - len(wrong)} / {len(EXAMPLES)} correct")
    return not wrong

# ------------------------------------------------------------
# Usage:
#   from isic_classifier import classify, self_test
#   self_test()
#   table[RESULT] = table["name"].apply(classify)
# ------------------------------------------------------------
