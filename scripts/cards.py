"""Frames the raw screenshots into marketing cards. Usage: python3 scripts/cards.py marketing/raw marketing/cards"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

RAW, OUT = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(); OUT.mkdir(parents=True, exist_ok=True)
FONTS = Path(__file__).resolve().parent.parent / "node_modules"

# file, kicker, headline, line
PHONE = [
  ("17-logging-pr-rest", "Train", "Log fast. Catch every PR.", "Weight, reps and RIR in two taps. Weight, rep, e1RM and bodyweight records flag themselves as you lift."),
  ("16-superset", "Supersets", "Pair any exercises you like.", "Group two, three or more lifts into a superset. Colour-coded by muscle, rest timer after the last one."),
  ("02-coach-feedback", "Your coach", "Feedback on every session.", "Your coach reads your logs and replies right where the set happened."),
  ("01-train-week", "Your coach", "New programs land in your app.", "Your coach sends the next block with a note. One tap and it is your plan."),
  ("03-progress-overlay", "Progress", "See a whole year of work.", "Overlay lifts on one chart, change the range, switch between dates and sessions."),
  ("04-strength", "Strength", "Know your numbers.", "Estimated maxes, total and DOTS score update from your logs, with formulas you can change."),
  ("05-records", "Records", "Every record, recorded.", "Heaviest weight, rep PRs, estimated 1RM and best lift at your current bodyweight."),
  ("06-volume", "Volume", "Volume that makes sense.", "Hard sets per muscle against your target, week by week, so nothing gets missed."),
  ("07-plan", "Plan", "A plan that adapts.", "Pump, workload and soreness feedback add or hold sets for the next week."),
  ("08-log-sheet", "Log sheet", "Prefer a spreadsheet?", "Edit a whole block like Excel. Type 100x8 100x8 95x9 and it is logged."),
  ("09-choose-split", "Programs", "Any split, or build your own.", "Thirteen hypertrophy splits, six powerlifting programs and a fully custom builder."),
  ("10-exercise-library", "Library", "Your exercise library.", "Grouped by muscle and fully editable: units, load steps and your own lifts."),
  ("12-light-train", "Everywhere", "Light or dark. Online or off.", "Works offline in the gym and syncs to your phone, tablet and computer."),
]
COACH = [
  ("18-coach-clients", "For coaches", "All your clients in one place.", "Share a code or invite link. Every client log syncs to you automatically."),
  ("19-coach-client-detail", "For coaches", "Read logs. Reply. Assign.", "Review sessions, leave feedback and send the next program from the same screen."),
]
DESK = [
  ("14-desktop-progress", "On the web", "Charts that fill your screen.", "The same account on your computer: full-width progress, records and plan editing."),
  ("15-desktop-volume", "On the web", "Plan the week at a glance.", "Volume against targets for every muscle, with your coach's changes layered on top."),
]

CSS = f"""
@font-face {{ font-family: 'BSD'; font-weight: 100 900; src: url('file://{FONTS}/@fontsource-variable/roboto/files/roboto-latin-wght-normal.woff2'); }}
@font-face {{ font-family: 'HG'; font-weight: 100 900; src: url('file://{FONTS}/@fontsource-variable/roboto/files/roboto-latin-wght-normal.woff2'); }}
* {{ box-sizing: border-box; margin: 0; }}
body {{ background: #0b0d10; font-family: 'HG', sans-serif; color: #f2f2ee; overflow: hidden; }}
.card {{ position: relative; overflow: hidden; background: radial-gradient(900px 700px at 85% -5%, #1b3a8a66, transparent 60%), radial-gradient(700px 600px at 0% 100%, #2f6bff22, transparent 60%), #0e1116; }}
.k {{ color: #5b8dff; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; font-size: 26px; }}
h1 {{ font-family: 'BSD'; font-weight: 700; line-height: 1.04; letter-spacing: -.02em; }}
p {{ color: #aab1bb; line-height: 1.4; }}
.brand {{ position: absolute; font-family: 'BSD'; font-weight: 800; color: #f2f2ee; opacity: .9; }}
.phone {{ position: absolute; border-radius: 76px; padding: 13px; background: #1a1f26; box-shadow: 0 0 0 2px #2d343d, 0 50px 120px -20px #000c, inset 0 0 0 2px #0006; }}
.phone img {{ display: block; width: 100%; border-radius: 63px; }}
.win {{ position: absolute; border-radius: 22px; background: #1a1f26; padding: 0; overflow: hidden; box-shadow: 0 0 0 2px #2d343d, 0 50px 120px -20px #000c; }}
.win .bar {{ height: 44px; background: #14181e; display: flex; align-items: center; gap: 9px; padding-left: 20px; }}
.win .bar i {{ width: 13px; height: 13px; border-radius: 50%; background: #2d343d; display: block; }}
.win img {{ display: block; width: 100%; }}
"""

def phone_html(f, k, h, t):
    return f"""<div class="card" style="width:1080px;height:1350px">
  <div class="brand" style="left:72px;top:60px;font-size:44px">Ledger</div>
  <div style="position:absolute;left:72px;top:150px;width:936px"><div class="k">{k}</div><h1 style="font-size:76px;margin-top:14px">{h}</h1><p style="font-size:31px;margin-top:22px;max-width:860px">{t}</p></div>
  <div class="phone" style="width:620px;left:230px;top:560px"><img src="file://{RAW}/{f}.png"></div></div>"""

def desk_html(f, k, h, t):
    return f"""<div class="card" style="width:1600px;height:1000px">
  <div class="brand" style="left:80px;top:64px;font-size:46px">Ledger</div>
  <div style="position:absolute;left:80px;top:250px;width:520px"><div class="k">{k}</div><h1 style="font-size:70px;margin-top:14px">{h}</h1><p style="font-size:30px;margin-top:24px">{t}</p></div>
  <div class="win" style="left:660px;top:150px;width:880px"><div class="bar"><i></i><i></i><i></i></div><img src="file://{RAW}/{f}.png"></div></div>"""

def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        for group, fn, size in ((PHONE + COACH, phone_html, (1080, 1350)), (DESK, desk_html, (1600, 1000))):
            for f, k, h, t in group:
                if not (RAW / f"{f}.png").exists(): print("missing", f); continue
                pg = b.new_page(viewport={"width": size[0], "height": size[1]}, device_scale_factor=1)
                html = f"<html><head><style>{CSS}</style></head><body>{fn(f, k, h, t)}</body></html>"
                tmp = OUT / f"_{f}.html"; tmp.write_text(html)
                pg.goto(f"file://{tmp}"); pg.wait_for_timeout(500)
                pg.screenshot(path=str(OUT / f"{f}.png")); tmp.unlink(); pg.close(); print("card", f)
        b.close()
main()
