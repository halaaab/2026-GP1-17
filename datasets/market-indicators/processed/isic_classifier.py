# ============================================================
# DARB — Business name -> ISIC4 / SSIC section & division
# Codes follow GASTAT's National Classification (SSIC, Sep 2026).
# The keyword -> code assignment is a team-built rule set:
#   validate it on a manually labelled sample before use.
# Rules are checked IN ORDER; the first match wins.
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

# (stems, section, division, label) — stems are matched on NORMALIZED text
RULES = [
    # ---------- M: professional / legal / consulting ----------
    (["محاماه", "محامي", "قانونيه", "محاسبه", "مراجعه حسابات"], "M", "69", "Legal & accounting"),
    (["استشارات هندسيه", "هندسيه استشاريه", "مكتب هندسي"],          "M", "71", "Engineering consulting"),
    (["دعايه", "اعلان", "تسويق"],                                   "M", "73", "Advertising & marketing"),
    (["تصميم", "تصوير", "ترجمه", "تخليص جمركي", "تخليص"],          "M", "74", "Other professional"),
    (["استشارات", "استشاريه"],                                      "M", "70", "Management consulting"),

    # ---------- I: food service & accommodation ----------
    (["مطعم", "مطاعم", "مقهي", "كافيه", "كوفي", "لتقديم", "اعاشه",
      "مطبخ", "بوفيه", "شاورما", "برجر", "بيتزا", "حلويات", "مخبز", "مخابز",
      "عصائر", "وجبات", "مشويات"],                                  "I", "56", "Food & beverage service"),
    (["فندق", "فنادق", "شقق مفروشه", "وحدات سكنيه مفروشه", "منتجع", "نزل"], "I", "55", "Accommodation"),

    # ---------- C: manufacturing (explicit factory words) ----------
    (["مصنع", "مصانع", "للصناعه", "صناعات", "للصناعات", "خرسانه", "طابوق", "بلك"], "C", "", "Manufacturing"),
    (["حداده", "حدادة", "المنيوم", "نجاره", "نجارة"],                "C", "25", "Metal & wood workshops"),
    (["خياط", "خياطه", "تفصيل"],                                    "C", "14", "Tailoring / apparel"),

    # ---------- N77 first, so "تأجير سيارات" is rental, not vehicle trade ----------
    (["تاجير", "لتاجير"],                                           "N", "77", "Rental & leasing"),
    # ---------- G45: vehicles ----------
    (["سيارات", "بنشر", "قطع غيار", "غيار", "اطارات", "كفرات", "زيوت",
      "سمكره", "ميكانيكا", "كهرباء سيارات"],                        "G", "45", "Motor vehicles trade & repair"),

    # ---------- N: rental, events, security, travel, cleaning ----------
    (["تنظيم المعارض", "معارض والمؤتمرات", "مؤتمرات", "تنظيم الحفلات", "لتنظيم"], "N", "82", "Events & business support"),
    (["امن$", "امنيه", "حراسات", "امن والسلامه"],                                    "N", "80", "Security"),
    (["سفر$", "سفريات", "سياحه", "سياحيه", "عمره"],                                "N", "79", "Travel & tourism agencies"),
    (["نظافه", "تنظيف", "مكافحه حشرات", "استقدام", "توظيف"],       "N", "81", "Cleaning / staffing"),

    # ---------- J: ICT ----------
    (["برمجيات", "برمجه", "تقنيه المعلومات", "حاسب", "تطبيقات",
      "ذكاء اصطناعي", "رقميه", "سحابيه", "تقنيه$", "تقنيات"],         "J", "62", "Software & IT services"),
    (["اتصالات", "انترنت"],                                         "J", "61", "Telecommunications"),
    (["نشر$", "اعلام$", "اعلاميه", "انتاج فني", "انتاج اعلامي"],                  "J", "58", "Publishing & media"),

    # ---------- S: personal services ----------
    (["مشغل", "صالون", "تجميل", "حلاقه", "حلاق", "سبا$", "مغسله", "كي ملابس"], "S", "96", "Personal services"),
    (["صيانه جوالات", "صيانه اجهزه"],                               "S", "95", "Repair of goods"),

    # ---------- F: construction ----------
    (["مقاولات", "مقاول", "انشاءات", "للبناء", "بناء$", "تشييد", "ترميم", "ديكور",
      "سباكه", "كهرباء", "تكييف", "تبريد", "دهانات", "عزل", "مصاعد"], "F", "43", "Construction"),

    # ---------- Q / P / R ----------
    (["عياده", "عيادات", "مجمع طبي", "مركز طبي", "طبي$", "طبيه", "اسنان", "علاج", "مختبر"], "Q", "86", "Health"),
    (["تعليم", "تدريب", "اكاديميه", "معهد", "مدرسه", "روضه", "حضانه"], "P", "85", "Education"),
    (["ترفيه", "ترفية", "رياضي", "رياضيه", "العاب", "نادي"],          "R", "93", "Sports & recreation"),

    # ---------- H: transport & logistics ----------
    (["نقل", "شحن", "لوجستي", "لوجستيه", "توصيل"], "H", "", "Transport & logistics"),

    # ---------- L / K / B / A ----------
    (["عقار", "عقارات", "عقاريه", "املاك", "تطوير عقاري"],           "L", "68", "Real estate"),
    (["استثمار", "قابضه", "تمويل"],                                  "K", "64", "Holding & investment"),
    (["تعدين", "محاجر", "كساره"],                                    "B", "08", "Mining & quarrying"),
    (["مزرعه", "مزارع", "زراعيه", "مشتل", "دواجن", "مواشي"], "A", "01", "Agriculture"),

    # ---------- G46/G47: retail & wholesale (specific goods) ----------
    (["بقاله", "تموينات", "سوبرماركت", "اسواق", "سوق", "خضار", "فواكه", "ملحمه",
      "لحوم", "تمور", "مواد غذائيه", "الغذائيه", "المشروبات", "عطور", "عطورات",
      "ملابس", "عبايات", "عبايه", "ازياء", "اقمشه", "احذيه", "مجوهرات",
      "اثاث", "مفروشات", "موكيت", "ستائر", "زهور", "هدايا", "مكتبه", "قرطاسيه",
      "جوالات", "الكترونيات", "بصريات", "نظارات", "صيدليه", "اعلاف", "مستلزمات",
      "معدات", "ادوات", "مواد بناء", "مستودع", "محل$", "محلات", "معرض", "ركن$", "متجر"],
                                                                     "G", "47", "Retail & wholesale"),
]

# Generic trading names ("…للتجاره" / "…التجاريه") with no specific activity
GENERIC_TRADE = ["للتجاره", "التجاريه", "تجاره", "تجاري"]

PREFIXES = ("وال", "بال", "فال", "لل", "ال", "و", "ل")

def _tokens(t):
    out = []
    for w in t.split():
        forms = {w}
        for p in PREFIXES:
            if w.startswith(p) and len(w) - len(p) >= 2:
                forms.add(w[len(p):])
        out.append(forms)
    return out

def _match(stem, text, toks):
    """Multi-word stem: phrase match. 'x$': exact word. Otherwise: a word starts with the stem."""
    if " " in stem:
        return stem in text
    if stem.endswith("$"):
        s = stem[:-1]
        return any(s in forms for forms in toks)
    return any(f.startswith(stem) for forms in toks for f in forms)

COMPILED = [([normalize(s).replace(" $", "$") if not s.endswith("$") else normalize(s[:-1]) + "$" for s in stems], sec, div, lab)
            for stems, sec, div, lab in RULES]
GENERIC = [normalize(s) for s in GENERIC_TRADE]

def classify(name: str):
    t = normalize(name)
    if not t:
        return pd.Series(["Unknown", "", "", "none"])
    toks = _tokens(t)
    for stems, sec, div, lab in COMPILED:
        if any(_match(s, t, toks) for s in stems):
            return pd.Series([sec, div, lab, "high"])
    if any(_match(g, t, toks) for g in GENERIC):
        return pd.Series(["G", "46", "General trading", "low"])
    return pd.Series(["Unknown", "", "", "none"])

# ------------------------------------------------------------
# Usage (Colab):
#   from isic_classifier import classify
#   darb_df[["isic_section", "isic_division", "isic_label", "sector_confidence"]] = \
#       darb_df["اسم السجل التجاري"].apply(classify)
#   print(darb_df["sector_confidence"].value_counts(normalize=True).mul(100).round(2))
# ------------------------------------------------------------

# ------------------------------------------------------------
# Validation sample (do this before training):
#   sample = darb_df[darb_df["sector_confidence"] != "none"].sample(300, random_state=42)
#   sample[["اسم السجل التجاري", "isic_section", "isic_label"]].to_csv("validation_sample.csv", index=False)
#   -> add a column "correct_section" by hand, then:
#   v = pd.read_csv("validation_sample_labelled.csv")
#   print("Accuracy:", (v["isic_section"] == v["correct_section"]).mean())
# ------------------------------------------------------------
