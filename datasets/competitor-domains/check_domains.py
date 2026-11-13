"""
Double-check every link in Darb_Competitor_Domain_List.xlsx (no API key needed).

For each row it checks:
  - Is the link alive?             (HTTP status)
  - Does it redirect elsewhere?    (final URL vs. the Domain column)
  - What is the page title?        (so you can eyeball it's the right site)
  - Does robots.txt allow bots?    (if not, the agent shouldn't extract it)
  - Is the Status column sensible? (gov.sa / edu.sa should be "Official & approved")
Results go to a new sheet "Link Check" with a Verdict column.

Usage (on your laptop, not a restricted network):
  pip install requests openpyxl
  python check_domains.py Darb_Competitor_Domain_List.xlsx
"""
import re
import sys
import urllib.robotparser
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from urllib.parse import urlparse

import requests
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill

path = sys.argv[1] if len(sys.argv) > 1 else "Darb_Competitor_Domain_List.xlsx"
TIMEOUT = 15
UA = "Mozilla/5.0 (DarbCompetitorAgent link check)"
OFFICIAL_SUFFIXES = (".gov.sa", ".edu.sa", ".org.sa")


def host(u):
    h = urlparse(u).netloc.lower()
    return h[4:] if h.startswith("www.") else h


def check(row):
    num, name, link, _label, _cat, status, domain = row[:7]
    r = {"num": num, "name": name, "link": link, "domain": domain, "status": status,
         "code": "", "final": "", "title": "", "robots": "", "issues": []}
    try:
        resp = requests.get(link, timeout=TIMEOUT, headers={"User-Agent": UA}, allow_redirects=True)
        r["code"] = resp.status_code
        r["final"] = resp.url
        m = re.search(r"<title[^>]*>(.*?)</title>", resp.text, re.I | re.S)
        r["title"] = re.sub(r"\s+", " ", m.group(1)).strip()[:120] if m else ""
        if resp.status_code >= 400:
            r["issues"].append(f"HTTP {resp.status_code}")
        if domain and not host(resp.url).endswith(domain.replace("www.", "")):
            r["issues"].append(f"redirects to {host(resp.url)}")
    except requests.RequestException as e:
        r["code"] = "ERROR"
        r["issues"].append(type(e).__name__)
    try:
        rp = urllib.robotparser.RobotFileParser()
        rp.set_url(f"{urlparse(link).scheme}://{urlparse(link).netloc}/robots.txt")
        rp.read()
        allowed = rp.can_fetch("*", link)
        r["robots"] = "Allowed" if allowed else "Blocked"
        if not allowed:
            r["issues"].append("robots.txt blocks bots")
    except Exception:
        r["robots"] = "Unknown"
    is_official_domain = (domain or "").endswith(OFFICIAL_SUFFIXES)
    if is_official_domain and status != "Official & approved":
        r["issues"].append("gov/edu domain but marked Needs checking")
    if status == "Official & approved" and not is_official_domain:
        r["issues"].append("marked Official but not a .gov.sa/.edu.sa/.org.sa domain - confirm")
    return r


wb = load_workbook(path)
ws = wb["Domain List"]
rows = [row for row in ws.iter_rows(min_row=2, values_only=True) if row[2]]

with ThreadPoolExecutor(max_workers=10) as pool:
    results = list(pool.map(check, rows))

if "Link Check" in wb.sheetnames:
    del wb["Link Check"]
out = wb.create_sheet("Link Check")
out.append(["#", "Website Name", "Link", "HTTP", "Final URL", "Page Title",
            "robots.txt", "Issues", "Verdict", "Checked at"])
for c in out[1]:
    c.font = Font(bold=True)
green, yellow, red = (PatternFill("solid", fgColor=x) for x in ("E3F4E8", "FFF4DC", "FBE3E3"))
now = datetime.now().strftime("%Y-%m-%d %H:%M")
for r in results:
    dead = r["code"] == "ERROR" or (isinstance(r["code"], int) and r["code"] >= 400)
    verdict = "Broken - fix link" if dead else ("Review" if r["issues"] else "OK")
    out.append([r["num"], r["name"], r["link"], r["code"], r["final"], r["title"],
                r["robots"], "; ".join(r["issues"]), verdict, now])
    out.cell(row=out.max_row, column=9).fill = red if dead else (yellow if r["issues"] else green)
    print(f"{r['num']:>3} {verdict:<18} {r['name'][:40]:<40} {'; '.join(r['issues'])}")
for col, w in zip("ABCDEFGHIJ", [5, 36, 40, 8, 40, 45, 11, 50, 18, 16]):
    out.column_dimensions[col].width = w
out.freeze_panes = "C2"

wb.save(path)
ok = sum(1 for r in results if not r["issues"])
print(f"\n{ok}/{len(results)} OK. See the 'Link Check' sheet.")
print("Note: a 403 often just means the site blocks scripts - open it in a browser before deleting it.")
