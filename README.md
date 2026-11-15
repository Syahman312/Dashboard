# Morning Dashboard

One screen to check every morning. It **reads** (and never writes) the Sheets behind your three apps:

| App | Sheet | Shows |
|---|---|---|
| **Flow** | Flow Data | Top 3, today's and overdue tasks, habits, ACCA study, month-end close |
| **Finance** | Finance tracker | Spending this month vs last, 6-month trend, top categories, net worth, debts, payslip, goals |
| **Garage** | Car Tracker | Road tax countdown, last service, items longest since done, fuel economy and spend |

There is also a **Health check** that lists problems in each app's data, such as missing columns, impossible dates,
categories written two ways, a negative debt, money in on a spending category, links to records that don't exist,
duplicates, stale data, and the sync and gold-price failures from each app's own log.

## Set up (about 10 minutes)

1. Go to <https://script.google.com> → **New project**, and name it `Dashboard`.
2. Create these files and paste in the contents from `apps-script/`:
   `Code.gs`, `Shared.gs`, `Garage.gs`, `Finance.gs`, `Flow.gs`, and an HTML file named `Index`.
   In **Project Settings**, tick *Show "appsscript.json"* and paste in `appsscript.json`.
   (Or use clasp: `npm i -g @google/clasp`, `clasp login`, `clasp create --type standalone --rootDir apps-script`, `clasp push`.)
3. **Project Settings → Script Properties**, add:
   - `FLOW_SHEET_ID`: the ID from the Flow Data sheet URL
   - `FINANCE_SHEET_ID`: the ID from the Finance tracker URL
   - `GARAGE_SHEET_ID`: the ID from the Car Tracker URL

   (The ID is the long part of the URL between `/d/` and `/edit`.)
4. In the editor, run **`testDashboard`** once. Google asks you to grant *read-only* access to Sheets.
   The execution log lists each sheet as OK or FAILED, followed by every issue found.
5. **Deploy → New deployment → Web app**. Set *Execute as: Me* and *Who has access: Only myself*.
   Open the URL, and on your phone use *Add to Home Screen*.

Data is cached for 5 minutes. **Refresh** reads the Sheets again.

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
