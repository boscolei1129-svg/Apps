# Lull: iPhone Shortcuts rest estimates

Lull remains a static, offline sleep diary. Shortcuts captures the times at which your **scheduled bedtime** and **Wake Up alarm** triggers run. Lull labels the interval **Estimated rest**, keeps it separate from manually logged nights and naps, and excludes it from sleep goals, debt, quality, stages and trends.

**This does not detect when you actually fall asleep or wake up.** A phone lying still is not evidence you are asleep. A locked/background web app cannot reliably keep running motion monitoring, and Safari does not expose native HealthKit/Core Motion access. No Motion & Fitness permission is requested. Lull's existing timer stores a start timestamp and calculates elapsed time after reopening; it does not continuously observe sleep.

## Choose how records reach Lull

| Mode | Capture at bedtime/wake | How records reach Lull | Accounts / secrets |
| --- | --- | --- | --- |
| Files only | Automatically save small JSON event files | Select those files in Lull when convenient | No new account or secret; iCloud Drive uses your existing Apple account |
| Optional private relay | Save the same files first, then POST each event | Lull fetches on launch/return to foreground, or Sync now | Your own Cloudflare deployment; separate private read/write tokens |

Neither mode opens a webpage at bedtime. Neither can make a suspended web app update its display while the phone is locked. The relay records events independently, then Lull catches up when open. **The relay is optional source code, not an already deployed service.** GitHub Pages cannot receive POSTs or hide server credentials.

If you already connected Lull to your relay, start with [Add HTTP capture to both shortcuts](#add-http-capture-to-both-shortcuts), then [attach the automations](#3-attach-bedtime-and-wake-automations). You can skip the Files steps unless you want a backup for failed requests.

## 1. Preserve your diary

1. Open the copy of Lull that contains your data (your Home Screen app or Safari).
2. Use **Settings → Export backup**. Keep that JSON somewhere safe. Do not clear Safari data or remove the Home Screen app to update.
3. After the repository change is merged into the branch used by Pages, open Lull online, close it and reopen it if needed to activate the updated offline cache. Look for **Settings → Shortcuts & rest estimates** or the same button in **Journal**.

Existing state stays under `localStorage['lull:v1']`: settings, `active`, and `entries` containing ID, sleep/nap type, start/end milliseconds, quality, mood, tags, dreams and optional sample marker. This change adds `restEvents` and `restDismissed` to that state. It preserves existing nights, naps, sounds, charts, tags, dreams and backups. Runtime relay credentials use a separate browser preference and never enter diary backups or CSV exports.

## 2. Create two iPhone shortcuts (Files mode)

Use the Apple **Shortcuts** app on the iPhone. Action names below use English; tap the action's disclosure arrow to see extra options. iOS versions can place these controls differently.

### Prepare a folder

In **Files → iCloud Drive → Shortcuts**, create a folder named **Lull**. If a fixed **On My iPhone** folder is available to the Save File action on your device, you may use that instead for local-only capture. iCloud files can sync to your other Apple devices; do not describe them as exclusively on the phone. Keep the folder downloaded for offline access where Files offers that option.

### Shortcut A: `Lull — Bedtime`

Create a new shortcut and add these actions in order:

1. **Date**: select **Current Date**. This captures when the automation actually executes.
2. **Format Date**: select the **Date** variable from step 1. Set **Date Format → ISO 8601** and turn on **Include Time** if shown. The result needs seconds and a timezone, for example `2026-11-20T23:00:00+08:00`. This is the timestamp.
3. Add a second **Format Date**. Select the **Date** variable from step 1 again. Set **Date Format → Custom** and enter `yyyyMMddHHmmssSSS`. This is the ID stamp. The timestamp and ID stamp both use built-in actions.
4. **Text**. Enter the JSON below. Replace the bracketed labels with the actual magic variables from steps 3 and 2. Keep the quotes around the two text values and keep `version` as the number `1`.

   ```json
   {"version":1,"id":"bedtime-[ID stamp variable]","event":"bedtime","at":"[ISO timestamp variable]"}
   ```

5. **Set Name**. Select the **Text** from step 4 and name it **bedtime-[ID stamp].json**, inserting the ID stamp variable from step 3.
6. **Save File**. Select the named text from step 5 and set its destination to your **Lull** folder. Turn off **Ask Where to Save** and **Overwrite If File Exists** if offered. If you see a subpath instead of a folder picker, use `Lull/bedtime-[ID stamp].json` relative to the Shortcuts folder, with the ID stamp inserted as a variable.

Run it once while unlocked. Grant access to that folder and check that the saved `.json` file contains a filled-in ID and ISO timestamp. Avoid actions that require tapping or typing during an unattended run.

### Shortcut B: `Lull — Wake`

Duplicate Shortcut A and rename it. Change the Text action's `event` value to `wake` and change the ID and file name prefixes from `bedtime-` to `wake-`. Run once unlocked and verify a second event file is saved.

## 3. Attach bedtime and wake automations

1. In **Health → Browse/Search → Sleep**, set up a sleep schedule with bedtime and wake time. Enable the schedule's **Wake Up alarm** if you will use the Sleep → Waking Up trigger.
2. In **Shortcuts → Automation → +**, create a personal automation with **Sleep → Bedtime Begins**. Choose **Run Immediately**. On versions showing **Ask Before Running**, turn it off and confirm **Don't Ask**. Add **Run Shortcut → Lull — Bedtime**, or select that shortcut when prompted.
3. Create another automation with **Sleep → Waking Up** and **Run Shortcut → Lull — Wake**, also set to run immediately. This trigger is tied to the Wake Up alarm, not a measurement of actual waking. Snoozing or staying in bed can make its estimate inaccurate.
4. If your version exposes **Privacy → Allow Running When Locked**, enable it for these shortcuts. Some versions do not show this option. Test both automations with the phone locked; file permissions, device protection, first unlock after restarting, iOS settings or automation failures can still prevent a run. Check the resulting files the next morning.
5. If you do not use a Wake Up alarm, use **Alarm → Is Stopped → Wake-up** instead, or an automation for **Sleep Focus turning off**. Those record alarm dismissal or Focus state, respectively, not actual waking. Use **one** wake automation; do not enable all the alternatives. Sleep Focus turning on can also replace scheduled bedtime if that better matches your routine. Do not run both bedtime variants.

The exact setup is tied to the iPhone's sleep schedule, not the goals entered in Lull. Changing a bedtime goal inside Lull does not change Health or these automations. No Apple Watch is required.

## 4. View the automatic captures in Lull

For **Files mode**, open **Journal → Shortcuts & rest estimates → Import Shortcuts events**. In Files, select the saved bedtime and wake `.json` files (use Select to choose several). Select older files again freely: each event ID imports only once. The picker also accepts a JSON array, JSON Lines text with one event per line, or the relay export format.

For **relay mode**, configure the service below, then connect it in Lull. With Remember enabled, Lull fetches on launch and when returning to the foreground after at least 60 seconds since the last attempt. Sync now is also available. Fetching does not require or transmit your manual sleep diary, dreams, tags or ratings.

Each complete pair appears as **Estimated rest**. Times display in the device's current timezone, including after travel; stored ISO instants preserve their timezone offsets. Daylight-saving changes use actual elapsed time. No guessed sleep-onset delay is subtracted. These periods do not become sleep entries and do not inflate sleep debt or goal streaks.

- One bedtime followed by one wake produces an estimate only for a 5-minute to 18-hour interval.
- Orphan wake, missing wake, multiple bedtimes before a wake, or an implausible interval appears under **Unpaired triggers**. No period is invented. Out-of-order delivery is sorted by event time.
- Identical event IDs are retries. Reusing an ID for different content rejects the whole import. A repeated trigger with a different time can create ambiguity; check that only one automation is enabled for each event.
- Existing diary overlaps are flagged. They are not overwritten, trimmed or counted twice in statistics.
- **Dismiss estimate** hides a wrong rest window and offers Undo. A dismissal persists through later imports, syncs and JSON backups.
- **Export rest CSV** exports clearly labeled rest estimates. The existing sleep CSV retains its original columns and values. **Export backup** includes raw trigger events and dismissals as well as your existing diary.

For a quick device test, run Bedtime manually, wait at least five minutes, run Wake, then import both files. Inspect the displayed interval and reimport them to confirm zero new records. Also test a scheduled locked-phone run. This repository's automated tests do not replace a real iPhone test.

## 5. Optional private relay deployment

This is a **single-person relay**. Give each person their own deployment and tokens. It stores only event ID, bedtime/wake kind, timestamp and schema version. Cloudflare processes these private rest times, and normal provider request metadata may exist even though application observability is disabled. It is not end-to-end encrypted. Files mode avoids this additional provider.

From a local checkout of this repository, with Node.js and a Cloudflare account:

```sh
cd lull/integrations/shortcuts-relay
npx wrangler login
npx wrangler deploy
```

The initial deployment deliberately returns `503 Relay not configured` until both secrets are set. Record its assigned HTTPS `workers.dev` URL. No Cloudflare account or deployment is configured by this PR.

Generate **two distinct 32-byte random base64url tokens** in a private local terminal (43 characters each). Run this command twice, privately; do not paste its output into GitHub, chat, screenshots or your app source:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Keep them in a password manager as the **write token** and **read token**. Store their values using Wrangler's interactive secret prompts, not command-line arguments or `wrangler.jsonc`:

```sh
npx wrangler secret put WRITE_TOKEN
npx wrangler secret put READ_TOKEN
```

Alternatively add the same two encrypted **Secrets** through the Worker's Cloudflare dashboard. Keep `ALLOWED_ORIGIN` set to `https://boscolei1129-svg.github.io`, with no `/Apps/lull/` path: CORS origins do not include paths. This origin is shared with other apps under the same GitHub Pages host. CORS is an extra browser restriction, not authentication. For stronger isolation, host Lull on its own origin and update the allowlist.

Do not place tokens in repository files, GitHub Pages HTML/JS/config, URL query strings/fragments, public Shortcut links, analytics, logs or screenshots. `.dev.vars*` and `.env*` are ignored, but prefer encrypted deployed secrets. GitHub Actions secrets do not stay private if a build embeds them into JavaScript. The browser needs only the scoped **read** token entered at runtime; it must never receive the write token or a provider/admin key.

### Add HTTP capture to both shortcuts

Create **Lull Bedtime** using the **Date** and the two **Format Date** actions in [Shortcut A](#shortcut-a-lull--bedtime). You can add the network actions immediately after those three actions. If you also want a file backup, keep **Save File** before the network request so you can import the saved event if the request fails.

1. Add **URL** with your actual relay address ending in `/events`. Keep credentials in the header below.
2. Add **Get Contents of URL**. Expand options; set **Method → POST**.
3. Add headers: `Authorization` = `Bearer YOUR_WRITE_TOKEN` and `Content-Type` = `application/json`. Substitute the real write token privately in your own Shortcut. Do not share that Shortcut publicly.
4. Set **Request Body → JSON** with these fields. Select the outputs of the two **Format Date** actions as magic variables.

   | Key | Type | Value |
   | --- | --- | --- |
   | `version` | Number | `1` |
   | `id` | Text | Type `bedtime-` or `wake-` and then insert the ID stamp from the second Format Date action |
   | `event` | Text | `bedtime` in A, `wake` in B |
   | `at` | Text | ISO timestamp from the first Format Date action |

5. Duplicate **Lull Bedtime** as **Lull Wake**. Change the POST `event` to `wake` and change the `id` prefix to `wake-`. If you enabled file backups, update the saved JSON and file name as well.
6. Run each shortcut once while unlocked to grant network permission. A successful response contains `ok: true`. If you test the pairing, wait at least five minutes between the two runs. Failed requests do not retry automatically. If you enabled file backups, you can import the saved files later.

#### If the JSON fields do not offer Select Variable

1. Add a **Text** action after both Format Date actions and before **Get Contents of URL**. Paste this template:

   ```json
   {"version":1,"event":"bedtime","at":"TIMESTAMP","id":"bedtime-IDSTAMP"}
   ```

2. In Text, replace `TIMESTAMP` with the variable from the first **Format Date** action. Replace `IDSTAMP` with the variable from the second **Format Date** action. Keep the quotes and the `bedtime-` prefix. Use the variable picker in the Text action to insert the two blue variables.
3. Add **Set Name** after Text. Use the Text as the input and name it `event.json`. This prepares the request body in memory.
4. In **Get Contents of URL**, switch **Request Body** to **File** and select the **Renamed Item** output of **Set Name**. Keep the **Authorization** header and add `Content-Type` with the value `application/json`.
5. In the wake shortcut, change `"event":"bedtime"` to `"event":"wake"` and use the `wake-` prefix before the same ID stamp variable.

To retry an event over HTTP, send the **saved JSON file unchanged**, using Get Contents of URL → POST → Request Body **File**, that file as input, and the same headers. Do not rerun the capture shortcut to retry an old event, since that records a new time and ID. The relay accepts captures up to seven days old; older files can still be imported directly into Lull.

### Connect Lull

Open **Settings → Shortcuts & rest estimates → Optional private relay**. Enter your HTTPS `/events` URL and the private **read token**, then tap **Connect & sync**.

If you have a private read token QR on another screen, tap **Scan read token QR** in Lull, allow camera access, and point your camera at it. Lull fills the token field and stops the camera. Scanning happens on your phone.

By default the token stays in memory only and is lost on reload. If you select **Remember on this browser**, it is saved in that browser's local storage for automatic launch sync. Any script running on that GitHub Pages origin can read locally saved credentials, so remember it only on a trusted device. It is not published in GitHub Pages and it is excluded from app backups and CSV. Safari and a Home Screen app may use different storage contexts; connect the one you use for your diary.

### Limits, rotation and deletion

- HTTPS only; bearer authorization on every read/write; read and write tokens cannot be interchanged. No public provisioning endpoint. Distinct secrets are required; unset/weak/identical secrets fail closed.
- Fixed allowed origin; no wildcard; credentials in query strings are rejected. Responses are `no-store`; the app will not follow redirects with a token.
- Bounded event body (2 KB), date validation, idempotent IDs, conflict rejection, transaction-protected writes, 20 new writes/hour, maximum 500 retained relay events. Successful duplicate retries do not consume the write quota. This is personal logging, not an unlimited public API.
- Events older than 90 days are excluded from reads and removed by daily cleanup (normally within 91 days). Fetch/import regularly and keep backups. Local event files, imported records and exports have independent retention.
- If a token leaks, use `wrangler secret put` to replace the corresponding secret, then update your private shortcuts or Lull's connection. Rotating tokens revokes old access without deleting stored events.
- **Disconnect & forget token** removes the saved browser connection, preserving local estimates. It does not disable iPhone automations or erase relay data.
- **Erase all nights** in Lull clears its local diary and event ledger and disconnects the relay. It does not delete Files, iCloud backups or relay records. Reimporting old files or reconnecting the relay can restore those events.
- To stop capture, disable both Shortcuts automations. To destroy the optional relay and its stored data, export what you need, then from its directory run `npx wrangler delete`. Follow Cloudflare's deletion confirmation and verify the Worker is gone. Remove your private capture tokens from the shortcuts and password manager if no longer needed. Deleting only a token or a GitHub branch is not data deletion.

## Verification and troubleshooting

From the repository root run:

```sh
node --test lull/tests/*.test.mjs
```

Coverage includes timezone/DST elapsed time, duplicate and out-of-order events, missing/ambiguous triggers, atomic invalid imports, existing diary preservation, backups, token separation, CORS, payload limits, rate limits, retention and concurrent relay writes using an in-memory storage harness. It does **not** prove deployed Cloudflare or locked-iPhone behavior. Test those after deployment.

During implementation, the relay also passed Wrangler's deployment dry run and a local workerd test with a real SQLite-backed Durable Object, concurrent capture, idempotent retries and scoped authenticated reads. A separate DOM smoke check covered onboarding, the active timer, sleep/nap diary, all tabs, estimates, dismissal/undo, runtime credentials and protection against importing an in-flight response after disconnect/erase. Graphics and audio were stubbed in that DOM check. No live cloud deployment or physical iPhone test was performed.

If you see no records, inspect Files first. No file means the automation, folder permission or Save File action failed. A file with no relay record means networking/authentication failed; import the file. `401` means a wrong or rotated scoped token; `403` means the browser origin is wrong; `503` means missing server secrets or unavailable storage; `409` means reused ID with different content; `429` means too many new events; `507` means export and reset your relay. A future-time rejection usually means a phone clock/timezone issue. A full browser-storage error requires space and another import; do not assume the records saved.

## References

- [Apple: Sleep event triggers](https://support.apple.com/guide/shortcuts/event-triggers-apd932ff833f/ios)
- [Apple: enable automatic execution](https://support.apple.com/guide/shortcuts/enable-or-disable-a-personal-automation-apd602971e63/ios)
- [Apple: current automation controls](https://support.apple.com/guide/shortcuts/add-automations-apdfbdbd7123/ios)
- [Apple: ISO 8601 support](https://support.apple.com/guide/shortcuts/technical-standards-supported-in-shortcuts-apdfd459e13d/ios)
- [Apple: HTTP requests and JSON bodies](https://support.apple.com/guide/shortcuts/request-your-first-api-apd58d46713f/ios)
- [WebKit: iOS background suspension](https://webkit.org/blog/8970/how-web-content-can-affect-power-usage/)
- [Cloudflare: Durable Objects setup](https://developers.cloudflare.com/durable-objects/get-started/)
- [Cloudflare: encrypted Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
