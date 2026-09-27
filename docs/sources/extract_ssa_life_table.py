"""Double extraction of the SSA period life table from the PDF print of ssa.gov/oact/STATS/table4c6.html.

Method A: pdfplumber text lines. Method B: pypdf text. Both parse rows of the form
  age  qM  lM  eM  qF  lF  eF
and must agree exactly on every value. Output: CSV with the raw published strings and parsed numbers."""
import re, sys, csv, hashlib
import pdfplumber, pypdf

PDF = sys.argv[1]
ROW = re.compile(r'^\s*(\d{1,3})\s+(0\.\d{6})\s+([\d,]+)\s+(\d+\.\d{2})\s+(0\.\d{6})\s+([\d,]+)\s+(\d+\.\d{2})\s*$')

def parse(lines):
    rows = {}
    for ln in lines:
        m = ROW.match(ln)
        if not m:
            continue
        age = int(m.group(1))
        if age in rows:
            raise SystemExit(f'duplicate age {age}')
        rows[age] = m.groups()[1:]
    return rows

def lines_plumber():
    out = []
    with pdfplumber.open(PDF) as pdf:
        for p in pdf.pages:
            out += (p.extract_text() or '').splitlines()
    return out

def lines_pypdf():
    out = []
    for p in pypdf.PdfReader(PDF).pages:
        out += (p.extract_text() or '').splitlines()
    return out

a, b = parse(lines_plumber()), parse(lines_pypdf())
assert sorted(a) == list(range(120)), f'pdfplumber ages: {sorted(a)[:3]}..{sorted(a)[-3:]} ({len(a)})'
assert sorted(b) == list(range(120)), f'pypdf ages: {len(b)}'
diff = [age for age in range(120) if a[age] != b[age]]
assert not diff, f'extractions disagree at ages {diff}'
with open(sys.argv[2], 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['age', 'male_q', 'male_l', 'male_e', 'female_q', 'female_l', 'female_e'])
    for age in range(120):
        qm, lm, em, qf, lf, ef = a[age]
        w.writerow([age, qm, lm.replace(',', ''), em, qf, lf.replace(',', ''), ef])
print('rows', len(a), 'both extractions identical; pdf sha256', hashlib.sha256(open(PDF, 'rb').read()).hexdigest())
