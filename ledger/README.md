# Bosco's Ledger

A phone-first spending tracker for an MPay wallet, in MOP. One static page, no build step, no account.

## What it does

- **Home**: how much is safe to spend this week (weeks start on Monday), monthly limits such as games, where the money went by category, and a savings goal.
- **Activity**: every transaction by day. Tap one to set its category; tick "Use this for every…" to teach it a rule.
- **Add**: pick MPay screenshots and tap **Read on this phone**. The text is read on the device (Tesseract, English + Traditional Chinese, models in `tessdata/`), and every row is checked against MPay's running balance before anything is saved. You can also paste text copied with Live Text.
- **Trends**: spending and money in on a line graph by day, week or month, averages, MPay balance over time, and games vs everything else.

## Your data

Everything is saved in the browser on your phone. Nothing is uploaded, and this repository holds no transactions.

- **Save backup file** in Settings writes every transaction, category and rule to one file.
- **Restore backup** in Settings loads that file, so you can move between phones, or between this app and the copy in Claude.

## Install on iPhone

Open the page in Safari, tap Share, then **Add to Home Screen**. It then opens like an app and keeps working without signal once the screenshot reader has been used once.
