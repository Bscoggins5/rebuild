# REBUILD — standalone PWA

A no-build, installable workout + nutrition tracker for the 12-week hybrid
return-to-fitness program. Pure HTML/CSS/JS — **no Node, no build step, no
Cloudflare.** This is a self-contained port of the ChatGPT/Next.js version in
the parent folder, made to run on a PC with no Node installed and to install on
an iPhone Home Screen.

## What's inside

- Periodized strength in the Marcus Filly "Persist Build" mold: three 3-week
  blocks (Foundation → Build → Peak), each capped by a deload on weeks 4/8/12.
  Movements change between blocks and load/reps progress within each block.
  Every lift shows tempo, rest, and a per-week load/intensity target, plus a
  "last: __" placeholder pulling your previous logged weight so progression is
  visible while you lift.
- 12 weeks of matching run prescriptions (5K test on week 12), with per-set
  weight / reps / RPE / done logging
- Readiness auto-regulation (sleep + soreness → green / amber / red)
- Rest timer with an end-of-timer beep
- Seven exact daily meal plans, family recipes, and a checkable Sunday shopping list
- Weekly weight / waist / sleep check-ins, weight-trend chart, benchmarks
- Everything saved on-device in `localStorage`; JSON backup export on the
  Progress tab
- Works offline after first load (service worker)

## Run it on your PC

From this `standalone` folder, double-click nothing — open PowerShell here and run:

```bash
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```

Then open **http://localhost:8330** in your browser. `Ctrl+C` stops the server.

(A static file server is needed rather than opening `index.html` directly,
because the service worker and "Add to Home Screen" require `http://`, not
`file://`.)

## Install on your iPhone

1. Make sure your iPhone and PC are on the **same Wi-Fi**.
2. On the PC, run `ipconfig` and note the IPv4 address (e.g. `192.168.1.50`).
3. In **Safari** on the iPhone, open `http://<that-ip>:8330`.
4. Tap **Share → Add to Home Screen**. Launch **REBUILD** like any app.

Once installed it keeps working offline. To always have it available you'd host
the folder somewhere (any static host — Netlify drop, GitHub Pages, etc.); ask
and I'll set that up.

## Editing

- `js/data.js` — the entire program. Strength is `RB.strengthBlocks` (three
  blocks; each movement has `wk: [week1, week2, week3]` and a `deload`, where
  each entry is `rx(sets, reps, target)` — set `null` to skip a movement that
  week). Running is `RB.runningWeeks`, food is `RB.nutritionPlans` /
  `RB.shoppingList`. Change numbers/movements/text here.
- `js/app.js` — UI logic and screens.
- `styles.css` — all styling (dark theme).
- After changing files, just refresh the browser. If a change ever seems stuck,
  bump `CACHE_NAME` in `sw.js`.

Nutrition values are estimates based on common USDA-style values. Use the label
on the actual product for whey, yogurt, bread, tortillas, granola, sauces,
frozen fries, buns, and cornbread.
