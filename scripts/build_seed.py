import openpyxl, json, re, sys
SRC = sys.argv[1]; OUT = sys.argv[2]
wb = openpyxl.load_workbook(SRC, data_only=True)

def s(v): return None if v is None else str(v).strip()
def num(v):
    try: return float(v)
    except: return None

def parse_blocks(ws):
    """Wide layout: week blocks of 6 columns; sessions stacked vertically. Returns {week: {session: [rows]}}"""
    rows = list(ws.iter_rows(values_only=True))
    heads = [(j, s(c)) for j, c in enumerate(rows[0]) if c and str(c).startswith("Week")]
    out = {}
    for j, label in heads:
        wk = int(re.sub(r"\D", "", label))
        sessions = []; cur = None
        for r in rows[1:]:
            c0, c1 = s(r[j]), s(r[j+1]) if j+1 < len(r) else None
            if c0 and c1 is None and c0 not in ("L", "Letter") and all(x is None for x in r[j+1:j+6]):
                cur = {"name": c0, "items": []}; sessions.append(cur); continue
            if cur is None or not c0 or c0 in ("L", "Letter") or not c1: continue
            cur["items"].append({"letter": c0, "exercise": c1, "intensity": s(r[j+2]), "sets": s(r[j+3]), "reps": s(r[j+4]), "rir": s(r[j+5])})
        sessions = [x for x in sessions if x["items"]]
        names = [x["name"] for x in sessions]
        for i, x in enumerate(sessions):
            if names.count(x["name"]) > 1 and i == names.index(x["name"]): x["name"] += " (Mon)"
        out[wk] = sessions
    return out

UNIT = re.compile(r"(kg|lbs?|pps?|p)\b", re.I)
def parse_load(txt, nsets):
    """'60x1,55x2' / '95kg' / '45lbs' / 'Sticky 70' -> (weights per set, unit, note)"""
    if not txt: return [None]*nsets, None, None
    t = txt.lower(); unit = None
    m = UNIT.search(t.replace(" ", ""))
    t2 = t.replace(" ", "")
    mu = re.search(r"(kg|lbs?|pps?|p)(?![a-z])", t2)
    if mu:
        u = mu.group(1); unit = "kg" if u == "kg" else "lb" if u.startswith("lb") else "pin"
    parts = [p for p in re.split(r",", t2) if p]
    weights = []
    for p in parts:
        mm = re.match(r"([a-z]*)(\d+(?:\.\d+)?)(?:kg|lbs?|pps?|p)?x(\d+)", p)
        if mm:
            weights += [float(mm.group(2))]*int(mm.group(3)); continue
        mm = re.search(r"(\d+(?:\.\d+)?)", p)
        if mm: weights.append(float(mm.group(1)))
    if not weights: return [None]*nsets, unit, txt
    if len(parts) == 1 and "x" not in t2: weights = weights[:1]*nsets
    weights = (weights + [weights[-1]]*nsets)[:max(nsets, len(weights))]
    note = txt if re.search(r"[a-z]{3,}", re.sub(r"kg|lbs?|pps?", "", t)) or "x" in t else None
    return weights, unit, note

def parse_reps(txt):
    if not txt: return []
    if re.fullmatch(r"\s*\d+\s*-\s*\d+\s*", txt): return None   # planned range, not performed
    out = []
    for p in txt.split(","):
        p = p.strip()
        if not p: continue
        m = re.match(r"(\d+)((?:\s*\+\s*\d+)*)", p)
        if not m: continue
        myo = [int(x) for x in re.findall(r"\+\s*(\d+)", m.group(2))]
        out.append({"reps": int(m.group(1)), "myo": myo})
    return out

def parse_range(r):
    if not r: return (None, None)
    m = re.match(r"(\d+)\s*-\s*(\d+)", r)
    if m: return int(m.group(1)), int(m.group(2))
    m = re.match(r"(\d+)", r)
    return (int(m.group(1)),)*2 if m else (None, None)

def toint(x):
    try: return int(float(x))
    except: return None

lib = {}
for r in list(wb["Exercise Library"].iter_rows(min_row=3, values_only=True)):
    if r[0]: lib[s(r[0])] = s(r[1]) or "Unknown"

mesos = []; sessions = []
for mi, (plan, log) in enumerate([("Meso 1", "Training Log"), ("Meso 2", "Log 2"), ("Meso 3", "Log 3")], 1):
    P = parse_blocks(wb[plan]); L = parse_blocks(wb[log])
    weeks = []
    for wk in sorted(P):
        sess = []
        for ss in P[wk]:
            items = []
            for it in ss["items"]:
                lo, hi = parse_range(it["reps"])
                items.append({"letter": it["letter"], "exercise": it["exercise"], "sets": toint(it["sets"]) or 0,
                              "repLo": lo, "repHi": hi, "rir": toint(it["rir"])})
            sess.append({"name": ss["name"], "items": items})
        weeks.append({"week": wk, "sessions": sess})
    mesos.append({"id": f"m{mi}", "name": f"Meso {mi}", "weeks": weeks})
    for wk in sorted(L if mi == 3 else {}):
        for ss in L[wk]:
            exs = []
            for it in ss["items"]:
                reps = parse_reps(it["reps"])
                if reps is None or not reps: continue
                n = len(reps)
                w, unit, note = parse_load(it["intensity"], n)
                sets = [{"weight": (w[i] if i < len(w) else None), "reps": reps[i]["reps"], "myo": reps[i]["myo"]} for i in range(n)]
                if all(x["weight"] is None for x in sets) and not note: pass
                exs.append({"letter": it["letter"], "exercise": it["exercise"], "unit": unit, "rir": toint(it["rir"]), "sets": sets, "note": note})
            if exs:
                sessions.append({"id": f"m{mi}w{wk}-{ss['name']}", "meso": f"m{mi}", "week": wk, "name": ss["name"], "date": None, "exercises": exs})

# Session Log (flat, richer) -> meso 1 and 2
grp = {}
for r in wb["Session Log"].iter_rows(min_row=4, values_only=True):
    if not r[4] or not r[1]: continue
    mi, wk, name, ex = int(r[1]), int(r[2]), s(r[3]), s(r[4])
    reps = [int(x) for x in r[8:12] if isinstance(x, (int, float))]
    note = s(r[14])
    unit = {"kg": "kg", "lb": "lb", "p": "pin", "pp": "pin"}.get(s(r[7]))
    if not reps: continue
    w = num(r[6])
    if w is None and note:
        ws_, u2, _ = parse_load(note, len(reps)); 
        if any(x is not None for x in ws_): weights = ws_; unit = unit or u2
        else: weights = [None]*len(reps)
    else: weights = [w]*len(reps)
    if not reps: continue
    plan_rir = toint(s(r[5]).split("-")[0]) if r[5] and re.match(r"\d", s(r[5])) else None
    key = (mi, wk, name)
    g = grp.setdefault(key, {"id": f"m{mi}w{wk}-{name}", "meso": f"m{mi}", "week": wk, "name": name, "date": None, "exercises": []})
    g["exercises"].append({"letter": f"{len(g['exercises'])+1}", "exercise": ex, "unit": unit, "rir": plan_rir,
        "sets": [{"weight": (weights[i] if i < len(weights) else None), "reps": reps[i], "myo": []} for i in range(len(reps))], "note": note})
sessions = [x for x in sessions if x["meso"] == "m3"] + list(grp.values())

# volume periodization targets
vp = wb["Volume Periodization"]; targets = {}
for r in vp.iter_rows(min_row=3, max_row=30, values_only=True):
    name = s(r[0])
    if not name or name.startswith("VOLUME"): continue
    vals = [num(x) for x in r[1:7]]
    if any(v is not None for v in vals): targets[name] = vals
landmarks = {}
go = False
for r in vp.iter_rows(min_row=1, max_row=60, values_only=True):
    if s(r[0]) == "Muscle Group" and s(r[1]) == "MV": go = True; continue
    if go and s(r[0]): landmarks[s(r[0])] = {"mv": num(r[1]), "mev": num(r[2]), "mav": num(r[3]), "mrv": num(re.sub(r"\D", "", str(r[4])) if r[4] else None)}
split = [{"day": s(r[0]), "session": s(r[1]), "emphasis": s(r[2])} for r in wb["Weekly split"].iter_rows(min_row=2, max_row=8, values_only=True) if r[0]]
mob = []
for r in wb["Flexibility & Mobility"].iter_rows(min_row=2, values_only=True):
    if r[0] and r[2] and r[0] != "Session": mob.append({"session": s(r[0]), "letter": s(r[1]), "exercise": s(r[2]), "sets": num(r[4]), "reps": s(r[5]), "tempo": s(r[6]), "note": s(r[8])})

used = {i["exercise"] for m in mesos for w in m["weeks"] for se in w["sessions"] for i in se["items"]} | {e["exercise"] for se in sessions for e in se["exercises"]}
for u in used: lib.setdefault(u, "Unknown")
json.dump({"mesos": mesos, "sessions": sessions, "library": lib, "targets": targets, "landmarks": landmarks, "split": split, "mobility": mob}, open(OUT, "w"), indent=0)
print(len(mesos), len(sessions), len(lib), list(targets)[:5], landmarks.get("Back"), len(mob))
