# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Ledger is a web app (installable PWA) wrapped for Android with Capacitor. The Android build shows the same web interface, so mobile web and the wrapper share one design language.

## Users

- Leonidas (Coach Leonidas), who built Ledger to replace his own Excel training workbooks and logs in it daily.
- His coaching clients: athletes who sign up under his coach code, follow programs he assigns and receive his feedback.
- Other coaches and their clients: friends who coach are testing it, added by one-time invite link or approved in the admin dashboard.

The main situation is one-handed logging in the gym between sets, then reviewing volume and progress later at a desk. Coaches read client logs and reply from a phone or a computer.

## Product Purpose

An offline-first training log for lifting. A lifter follows a mesocycle plan, logs weight, reps and effort, and sees volume and progress. A coach sees the logs of clients registered under them, comments on sessions and assigns programs. Success is logging that is faster than a spreadsheet without losing the spreadsheet's flexibility.

## Positioning

Coach and client work in one tool that is shaped like the coach's own workbook: sessions with A/B superset letters, colour-coded exercises, a spreadsheet-style log sheet, fully custom programs and rotations. It works offline in the gym, and the user keeps the data (exports and backups, no subscription). The strength science is built in and editable: estimated 1RM and DOTS formulas, RIR or RPE, PR checks including bodyweight-relative records, and volume against muscle landmarks.

## Operating Context

- Gym use on a phone, mostly offline, one hand, often between sets with a rest timer running. The rest timer rings through a system notification on Android.
- Review at a desk on the website, ledger.coachleonidas.com.
- Data lives per account in IndexedDB on the device and syncs through a Cloudflare Worker and D1 database when online. Last write wins per record.
- Accounts: email and password, or Google sign-in. A coach role comes from a coach key, an admin-issued invite link or admin approval. The admin dashboard is limited to addresses in an ADMIN_EMAILS secret that sign in with Google.
- Bodyweight can be read from the Mealcost app through a read-only link token.
- Source workbooks: Training Log Leo 2026.xlsx and Program Leo 2026.xlsx in the coach's Drive (My Drive/1. Me/2026).

## Capabilities and Constraints

- 13 hypertrophy splits (including an A/B upper-lower rotation), 6 powerlifting programs, and a custom builder with repeated sessions and a two-week layout rotation.
- Logging with RIR or RPE, myo-reps, plate calculator, warm-ups, rest timer, exercise swap, supersets of any size, technique notes and bar-path video analysis.
- Progression modes: sheet only, sheet plus pump, workload and soreness feedback, or auto capped at the volume landmark.
- Progress charts with lift overlay, strength and records views, volume per muscle, an editable exercise library with renaming across history.
- Coach tools: client list, client logs and charts, comments per session, assigned programs, invite links and a coach code.
- Sample data: the coach's real 2026 log or a generated year for any split.
- Terminology: a mesocycle is one training block, a session is one workout, RIR is reps in reserve, e1RM is estimated one-rep max, letters like A1 and A2 mean the same letter is one superset and the number is the order inside it.
- Password reset and email confirmation need the EMAIL binding (see README); coach and admin reset links work without it. Not built: native iOS app, push notifications (email only), pushing edits into a running assigned program.

## Brand Commitments

The name is Ledger. Copy is short and professional, with no emojis and no em dashes in user-facing text. The plate colours carry meaning: red near failure, yellow approaching, green on target or in reserve.

## Evidence on Hand

- The coach's real 2026 workbook data is in `src/data/seed.json` (3 mesocycles, 68 sessions). History for 2020 to 2025 is not imported.
- Marketing screenshots and cards in `marketing/` are generated from demo accounts and demo data, not real clients.
- No testimonials, customer counts, press or benchmarks exist. Future work must not invent them.

## Product Principles

1. Speed of entry beats decoration; a set should take a few taps.
2. The plan is the user's own sheet: it can be edited, rotated and exported, and the app adapts to it rather than the reverse.
3. Numbers are tabular and never truncated.
4. The coach and the athlete see the same truth, with the coach read-only on the athlete's data.
5. Plate colours carry meaning; muscle colours identify, never decorate.

## Accessibility & Inclusion

Text contrast at least 4.5:1, touch targets sized for one-handed use, reduced motion respected, and keyboard focus visible.
