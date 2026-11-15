# Morning Dashboard

One screen to check every morning. It **reads** (and never writes) the Sheets behind your three apps:

| App | Sheet | Shows |
|---|---|---|
| **Flow** | Flow Data | Top 3, today's and overdue tasks, habits, ACCA study, month-end close |
| **Finance** | Finance tracker | Spending this month vs last, 6-month trend, top categories, net worth, debts, payslip, goals |
| **Garage** | Car Tracker | Road tax countdown, last service, items longest since done, fuel economy and spend |

At the top, a **Morning brief** sums the day up in a few sentences (sync problems first), and **Coming up** lists every dated
item in the next 45 days from all three apps: tasks, exams, road tax, goals and expected payday. Each card shows when its
app last saved to the Sheet, so a broken sync is obvious.

There is also a **Health check** that lists problems in each app's data, such as missing columns, impossible dates,
categories written two ways, a negative debt, money in on a spending category, links to records that don't exist,
duplicates, stale data, and the sync and gold-price failures from each app's own log.
Each problem links straight to the sheet row, and **Hide** removes ones you already know about (on that device).

## Set up (about 10 minutes)

1. Go to <https://script.google.com> → **New project**, and name it `Dashboard`.
2. Create these files and paste in the contents from `apps-script/`:
   `Code.gs`, `Shared.gs`, `Garage.gs`, `Finance.gs`, `Flow.gs`, and an HTML file named `Index`.
   In **Project Settings**, tick *Show "appsscript.json"* and paste in `appsscript.json`.
   (After this first time, use `npm run deploy` instead. See *Publishing changes with one command* below.)
3. **Project Settings → Script Properties**, add:
   - `FLOW_SHEET_ID`: the ID from the Flow Data sheet URL
   - `FINANCE_SHEET_ID`: the ID from the Finance tracker URL
   - `GARAGE_SHEET_ID`: the ID from the Car Tracker URL

   (The ID is the long part of the URL between `/d/` and `/edit`.)
4. In the editor, run **`testDashboard`** once. Google asks you to allow access to your Sheets. (Apps Script needs full Sheets access to open a Sheet by its ID, but the dashboard code never writes.)
   The execution log lists each sheet as OK or FAILED, followed by every issue found.
5. **Deploy → New deployment → Web app**. Set *Execute as: Me* and *Who has access: Only myself*.
   Open the URL, and on your phone use *Add to Home Screen*.

6. Optional, for instant opening: run **`installWarmUp`** once from the editor (it asks for permission to run on a timer).
   From 6am until midnight it re-reads the Sheets every 15 minutes, so the page never waits about 12 seconds for them.

Data is cached for 30 minutes. **Refresh** reads the Sheets again. The page also keeps the last data on your device,
so it shows straight away and updates behind it.

## Publishing changes with one command (clasp)

Do this once on your PC. After that, `npm run deploy` replaces copying files by hand.

**One-time setup**

1. Install **Node.js LTS** from <https://nodejs.org> (version 22 or newer).
2. Turn on the **Google Apps Script API**: <https://script.google.com/home/usersettings> → *Google Apps Script API* → On.
3. Get this repository onto your PC (GitHub Desktop, or `git clone https://github.com/syahman312/dashboard.git`),
   then switch to the branch `claude/quirky-albattani-2xi1ko`.
4. Open a terminal in that folder and run:
   ```
   npm install
   npm run setup
   ```
   Setup signs you in to Google, asks for the **Script ID** (Apps Script editor → Project Settings ⚙ → IDs) and finds
   your web app deployment. It saves both in `.clasp.json` and `.deployment-id`. Neither file is committed.

**Every time after**

```
npm run deploy
```

This runs the tests, uploads all the files, and publishes a new version of the **same** web app, so the URL never changes.
If the tests fail, nothing is uploaded.

Other commands: `npm run push` uploads without publishing (to try things in the editor first), and `npm run open` opens the
project in the Apps Script editor.

> Note: the files in `apps-script/` are the master copy. A deploy overwrites whatever is in the online editor,
> so make edits here rather than in the editor.

## Develop

```bash
npm test          # runs the real .gs code in Node against sample sheets
npm run preview   # builds dev/sample-dashboard.json and opens Index.html with it
```

`test/fixtures.js` contains made-up sheets with the same tabs and columns as the real ones.
If an app changes its columns, update the fixture and the column list at the top of that reader
(`GARAGE_COLUMNS`, `FINANCE_COLUMNS`, `FLOW_COLUMNS`).

## Layout

```
apps-script/
  Code.gs       web app entry, caching, cross-app checks
  Shared.gs     the shared foundations: dates, amounts, table reading, issue format
  Flow.gs       Flow Data reader + checks
  Finance.gs    Finance tracker reader + checks
  Garage.gs     Car Tracker reader + checks
  Index.html    the page (no build step, no libraries)
docs/CONVENTIONS.md   the rules every app should follow from now on
test/                 Node tests with fake sheets
dev/                  sample data for previewing the page
```

## Adding a new app

1. Write `NewApp.gs` with `readNewApp_(ss, ctx)` that returns `{ summary, issues }` using the helpers in `Shared.gs`.
2. Add it to `SOURCES` in `Code.gs` and add a Script Property for its Sheet ID.
3. Add a card renderer in `Index.html`.
