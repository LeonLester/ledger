# Ledger

Offline-first mesocycle training log. Built from Leonidas's 2026 training workbook, modelled on RP Hypertrophy's workflow, with ideas from Liftosaur, wger, openGym, GymCoach and LiftTrace.

## Run
    npm install
    npm run dev        # http://localhost:5173
    npm run build && npm run preview

First launch seeds IndexedDB from `src/data/seed.json` (Meso 1 to 3, 68 sessions, 70 exercises, volume targets, landmarks, split).
Regenerate the seed from the workbook: `SRC="/path/Training Log Leo 2026.xlsx" npm run seed`.

## Features
- Today view from your plan: supersets keep their A1/B2 letters, rep ranges, plan RIR, last-time column, double-progression "Aim" targets
- Set logging with weight, reps (myo-reps as 8+3+3), RIR; plate-coloured done discs show proximity to failure
- Rest timer with vibration and beep, warm-up ramp, plate calculator, exercise swap by muscle, per-exercise notes
- Three progression modes: Sheet (your periodization), Sheet + feedback, Auto (RP-style pump, workload, soreness rules, capped at MRV)
- Volume per muscle against targets and MRV, block heat map
- Progress: e1RM charts, best lifts, bodyweight
- Backup/restore JSON, CSV export, FitNotes CSV export

## Deploy and updates
- Web: push to `main`. `.github/workflows/deploy.yml` type-checks, builds and runs `wrangler deploy` to https://ledger.coachleonidas.com. Repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. The installed web app updates itself through its service worker.
- Android: `.github/workflows/android.yml` builds a signed APK on every push to `main` and publishes `ledger.apk` to the `android-latest` release (notes carry "Build N"). The app checks that release, shows an Update banner, downloads the APK inside the app and opens the system installer. Same signing key every build, so updates install over the old app and keep your data. Optional secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`.
- First install on the phone: open https://github.com/LeonLester/ledger/releases/tag/android-latest, download `ledger.apk`, allow installs from your browser.

## Cloudflare (phase 2)
`wrangler.jsonc` deploys `dist/` as static assets. Next: D1 for sync (every row already has `athleteId`), Access or passkeys for auth, a Worker API, custom domain.

## Programs, records and bar path

- **Programs** (Plan, New program): 13 hypertrophy splits (full body 2 to 6 a week, upper/lower with any X and Y, PPL variants, PPLUL, Arnold, body part, torso/limbs, PHUL, anterior/posterior) and 6 powerlifting programs (StrongLifts 5x5, Starting Strength, GZCLP simplified, 5/3/1 BBB, Texas Method, 6 week RPE peaking block). Percent programs are built from the 1RMs you enter.
- **Sample data**: first launch offers three real mesocycles to explore. More, Erase all data returns to that screen.
- **Records**: every set is checked against all earlier sessions for a heaviest-weight PR, a rep PR at that weight, an e1RM PR, the best e1RM at the same bodyweight, and the best e1RM per kg bodyweight. Live while logging and again when you finish.
- **Strength** (Progress): e1RM per lift, SBD total, DOTS, rep max table, weekly sets, tonnage, intensity, RPE and technique rating.
- **Technique and bar path** (video icon on any exercise): rate technique, tag faults, or load a side-on video, mark the plate centre and edge (45 cm sets the scale) and the app tracks the bar on device. It reports range of motion, mean and peak concentric velocity, velocity loss and horizontal drift per rep, and stores the path with the set.
- `npm test` checks the tracker, split and program generators and the PR engine.
