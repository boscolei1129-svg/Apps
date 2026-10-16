# Lull

A calm, night-sky sleep journal that lives on your Home Screen. No accounts, no server, no tracking: everything stays on your phone.

## What it does

- **One-tap tracking.** Tap *Going to bed* at night and *I'm awake* in the morning. The timer keeps running even if you close the app. You can also add or edit any night by hand.
- **Morning check-in.** Rate the night with moon phases (fuller means deeper), pick how you feel, tag what you did before bed, and write down dreams.
- **Naps.** Logged separately, shown in gold.
- **The moon.** The big moon on the Tonight screen fills up as you get closer to your sleep goal, both while you sleep and for last night.
- **Goal, streaks and sleep debt.** Set a nightly target, see how many nights in a row you've hit it, and how much sleep you owe over the last 14 days.
- **Trends.** 7, 30 and 90 day views of time asleep, when you slept, quality and mood, and which habits (caffeine, late screens, exercise and your own tags) go with longer or shorter sleep.
- **Bedtime calculator.** Works out bedtimes or wake times that line up with 90 minute sleep cycles, and can set your bedtime goal in one tap.
- **Sleep sounds.** Rain, ocean, fan, brown, pink and white noise, made on the device so they work offline, with a sleep timer.
- **Backups.** Export and import a JSON backup, or export a CSV for spreadsheets.

## Where it lives

Lull is the `lull` folder of this repo. With GitHub Pages turned on for the repo (**Settings → Pages**, deploy from the default branch, root folder), it's at:

https://boscolei1129-svg.github.io/Apps/lull/

## Add it to your Home Screen

**iPhone or iPad (Safari):** open the link, tap the **Share** button, then **Add to Home Screen**.

**Android (Chrome):** open the link, tap **⋮ → Install app** (or **Add to Home screen**). Lull also shows an *Install* button on its first screen when your browser supports it.

Open it once while you're online so it can save itself and its fonts for offline use. After that it works without a connection.

## Your data

- Nights are stored in your browser's local storage on that one device. Nothing is uploaded anywhere.
- On iPhone, the Home Screen app keeps its own storage, separate from Safari. Deleting the Home Screen icon deletes its data.
- Use **Settings → Export backup** now and then. **Import backup** adds any nights that aren't already there, so it's safe to import onto a phone that already has data.

## Updating

Change the files and commit. The app picks up the new version the next time it's opened (sometimes it takes two launches). If something looks stuck, change `VERSION` at the top of `sw.js` (for example to `lull-v2`) and commit again; that forces a clean refresh.

## Try it on your computer

The app needs to be served over http, not opened as a file:

```sh
python3 -m http.server 8000
```

Run that from the repo root, then visit http://localhost:8000/lull/.

## Make it yours

- **Colors and fonts:** the `:root` block at the top of `css/app.css`.
- **Default habit tags:** `DEFAULT_TAGS` in `js/store.js` (you can also add and remove tags in Settings).
- **Quality and mood words:** `QUALITY` and `MOOD` in `js/store.js`.

## Files

```
index.html            app shell and Home Screen meta tags
manifest.webmanifest  name, colors and icons for installing
sw.js                 offline caching
css/app.css           all styles and animations
js/app.js             screens, actions and the morning check-in
js/store.js           saving, sleep maths, streaks, debt, backups
js/ui.js              moon drawing, sheets, toasts, formatting
js/charts.js          the Trends charts
js/sounds.js          sleep sound generator and player
js/sky.js             the twinkling starfield
icons/                app icons
```

Fonts are Fraunces and Figtree from Google Fonts, cached after the first visit.
