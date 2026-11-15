"""Captures marketing screenshots from a running local Ledger (wrangler dev on :8799 with COACH_KEY=demo-coach-key).
Usage: python3 scripts/screenshots.py marketing/raw"""
import json, re, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8799"
OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
DESK = dict(viewport={"width": 1280, "height": 800}, device_scale_factor=2)

def call(req, path, body=None, token=None, method="POST"):
    h = {"content-type": "application/json", **({"authorization": f"Bearer {token}"} if token else {})}
    r = req.fetch(BASE + path, method=method, data=json.dumps(body) if body is not None else None, headers=h)
    if not r.ok: raise RuntimeError(f"{path} {r.status} {r.text()}")
    return r.json()

def open_app(browser, auth, scheme="dark", desktop=False):
    ctx = browser.new_context(**(DESK if desktop else PHONE), color_scheme=scheme)
    ctx.add_init_script(f"localStorage.setItem('ledger.auth', {json.dumps(json.dumps(auth))})")
    page = ctx.new_page(); page.goto(BASE); page.wait_for_timeout(1500)
    return ctx, page

def shot(page, name):
    page.wait_for_timeout(500); page.screenshot(path=str(OUT / f"{name}.png")); print("shot", name)

def tab(page, name): page.locator("nav button, .tabbar button, button").filter(has_text=re.compile(f"^{name}$")).first.click(); page.wait_for_timeout(700)

def load_sample(page, label):
    page.get_by_text("Load sample data").first.click()
    page.wait_for_timeout(400)
    page.locator(".scrim button.sess-row").filter(has_text=label).first.click()
    page.wait_for_selector("text=Train", timeout=20000); page.wait_for_timeout(2500)

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        api = p.request.new_context()
        coach = call(api, "/api/signup", {"name": "Leonidas", "email": "coach@demo.test", "password": "demo-password-1", "coachKey": "demo-coach-key"})
        code = coach["user"]["invite"]
        people = [("Alex Morgan", "alex@demo.test", "PPL Rest PPL"), ("Maria Petrou", "maria@demo.test", "Upper Lower, 4 days"), ("Nikos Dimas", "nikos@demo.test", "Full body")]
        accts = {}
        for name, email, split in people:
            a = call(api, "/api/signup", {"name": name, "email": email, "password": "demo-password-1", "code": code}); accts[name] = a
            ctx, page = open_app(browser, a)
            load_sample(page, split)
            for _ in range(60):
                rows = call(api, "/api/coach/clients", token=coach["token"], method="GET")["clients"]
                if any(r["name"] == name and r["sessions"] > 50 for r in rows): break
                page.wait_for_timeout(1000)
            else: raise RuntimeError(f"{name} did not sync: " + page.evaluate("document.body.innerText.slice(0,300)"))
            ctx.close()
        # coach loads a sample so there is a program to assign
        ctx, page = open_app(browser, coach); page.get_by_role("button", name="Train", exact=True).click(); page.wait_for_timeout(800)
        load_sample(page, "Upper Lower, 4 days"); page.wait_for_timeout(1500)
        coach_ctx, coach_page = ctx, page
        ctx.storage_state(path=str(OUT / ".coach.json"))
        json.dump({"coach": coach, "accts": accts, "code": code}, open(OUT / ".accts.json", "w"))
        browser.close()

def login(api, email): return call(api, "/api/login", {"email": email, "password": "demo-password-1"})

def capture():
    with sync_playwright() as p:
        browser = p.chromium.launch(); api = p.request.new_context()
        coach = login(api, "coach@demo.test"); alex = login(api, "alex@demo.test")
        cid = alex["user"]["id"]
        seeded = (OUT / ".seeded").exists()
        sync = call(api, "/api/sync", {"since": 0}, token=coach["token"]) if not seeded else {"docs": []}
        docs = sync["docs"]
        if not seeded:
          meso = next(d["data"] for d in docs if d["kind"] == "mesos" and d["id"] == "m11")
          split = next(d["data"]["value"] for d in docs if d["kind"] == "kv" and d["id"] == "split")
          call(api, "/api/coach/assign", {"clientId": cid, "name": "Upper Lower, 4 days: next block", "note": "Four days a week, same lifts you know with a little more volume on back and shoulders. Start it Monday.", "payload": {"meso": meso, "split": split, "mode": "feedback", "effort": "rir"}}, token=coach["token"])
          call(api, "/api/coach/comment", {"clientId": cid, "sessionId": "m11w2-Push 1", "body": "Bench moved well. Hold 82.5 for the top set next week and add a rep before you add weight."}, token=coach["token"])
          call(api, "/api/coach/comment", {"clientId": cid, "sessionId": None, "body": "Great consistency this block. Sleep and protein are the levers now, keep them steady."}, token=coach["token"])
          (OUT / ".seeded").write_text("1")

        ctx, page = open_app(browser, alex)
        nav = lambda n: (page.get_by_role("button", name=n, exact=True).first.click(), page.wait_for_timeout(900))
        top = lambda: page.evaluate("window.scrollTo(0,0)")
        shot(page, "01-train-week")
        # coach feedback inside a logged session
        page.get_by_role("button", name=re.compile("Push 1")).first.click(); page.wait_for_timeout(900); top(); shot(page, "02-coach-feedback")
        page.get_by_role("button", name="Back to sessions").click(); page.wait_for_timeout(500)

        nav("Progress")
        page.get_by_role("button", name=re.compile("Choose lifts")).click(); page.wait_for_timeout(400)
        for n in ["Barbell Bench Press", "Back Squat", "Barbell Row"]: page.locator("label", has_text=n).first.locator("input").check()
        page.get_by_role("button", name=re.compile("Barbell Bench Press")).first.click(); page.wait_for_timeout(600); top(); shot(page, "03-progress-overlay")
        page.get_by_role("button", name="Strength", exact=True).click(); page.wait_for_timeout(900); top(); shot(page, "04-strength")
        page.get_by_role("button", name="Records", exact=True).click(); page.wait_for_timeout(900); top(); shot(page, "05-records")

        nav("Volume"); top(); shot(page, "06-volume")
        nav("Plan"); page.evaluate("document.querySelector('table.t').closest('section').scrollIntoView({block:'start'})"); shot(page, "07-plan")
        page.get_by_role("button", name="Log sheet", exact=True).click(); page.wait_for_timeout(900); page.evaluate("document.querySelector('.sheet-grid').closest('section').scrollIntoView({block:'start'})"); shot(page, "08-log-sheet")
        page.evaluate("window.scrollTo(0,0)")
        page.get_by_role("button", name="New program").click(); page.wait_for_timeout(900); top(); shot(page, "09-choose-split")
        page.reload(); page.wait_for_timeout(1500)

        nav("More"); page.locator(".lib-scroll").scroll_into_view_if_needed(); page.wait_for_timeout(500)
        page.evaluate("document.querySelector('.lib-scroll').scrollIntoView({block:'center'})"); shot(page, "10-exercise-library")
        page.evaluate("window.scrollTo(0,0)"); shot(page, "11-more-settings")

        # light theme
        ctx2, p2 = open_app(browser, alex, scheme="light")
        shot(p2, "12-light-train")
        p2.get_by_role("button", name="Progress", exact=True).first.click(); p2.wait_for_timeout(1000); shot(p2, "13-light-progress"); ctx2.close()

        # desktop
        ctx3, p3 = open_app(browser, alex, desktop=True)
        p3.get_by_role("button", name="Progress", exact=True).first.click(); p3.wait_for_timeout(1200)
        p3.get_by_role("button", name=re.compile("Choose lifts")).click(); p3.wait_for_timeout(400)
        for n in ["Barbell Bench Press", "Back Squat", "Barbell Row"]: p3.locator("label", has_text=n).first.locator("input").check()
        p3.get_by_role("button", name=re.compile("Barbell Bench Press")).first.click(); p3.wait_for_timeout(800); shot(p3, "14-desktop-progress")
        p3.get_by_role("button", name="Volume", exact=True).first.click(); p3.wait_for_timeout(1200); shot(p3, "15-desktop-volume")
        ctx3.close()

        # live logging, last because it leaves a session open
        page.reload(); page.wait_for_timeout(1500); nav("Train")
        page.get_by_role("button", name="Next week").click(); page.wait_for_timeout(500)
        page.get_by_role("button", name=re.compile("Pull 1")).first.click(); page.wait_for_timeout(900)
        page.get_by_label("Superset with the exercise above").first.click(); page.wait_for_timeout(500); top(); shot(page, "16-superset")
        page.get_by_role("button", name="Back to sessions").click(); page.wait_for_timeout(500)
        page.get_by_role("button", name=re.compile("Push 1")).first.click(); page.wait_for_timeout(900)
        art = page.locator("article.ex")
        def fill(i, j, w, r, rir):
            ins = art.nth(i).locator("input.cell"); base = 3 * j
            ins.nth(base).fill(str(w)); ins.nth(base + 1).fill(str(r)); ins.nth(base + 2).fill(str(rir))
            art.nth(i).get_by_label(f"Set {j+1} done").click(); page.wait_for_timeout(250)
        fill(0, 0, 102.5, 6, 2); fill(0, 1, 100, 6, 2); top(); shot(page, "17-logging-pr-rest")
        ctx.close()

        # coach side
        cctx, cp = open_app(browser, coach)
        cp.wait_for_timeout(1500); shot(cp, "18-coach-clients")
        cp.get_by_role("button", name=re.compile("Alex Morgan")).first.click(); cp.wait_for_timeout(1500); shot(cp, "19-coach-client-detail")
        cctx.close()
        browser.close()

if len(sys.argv) > 2 and sys.argv[2] == "capture": capture()
else: main()
