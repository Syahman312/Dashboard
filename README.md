# Morning Dashboard

One screen to check every morning. It **reads** (and never writes) the Sheets behind your three apps:

| App | Sheet | Shows |
|---|---|---|
| **Flow** | Flow Data | Top 3, today's and overdue tasks, habits, ACCA study, month-end close |
| **Finance** | Finance tracker | Spending this month vs last, 6-month trend, top categories, net worth, debts, payslip, goals |
| **Garage** | Car Tracker | Road tax countdown, last service, items longest since done, fuel economy and spend |
| **Vault** | Vault Data | Documents and when they expire |
| **NextRole** | NextRole's sheet | Career goals, job applications and next steps, ACCA papers, CPD hours, skill gaps |
| **Voyage** | Voyage's sheet | Next trip countdown, trip budget, to-dos, packing, bookings, past trips |
| **Nest** | Nest DB | Move-in countdown, home budget, must-haves still to get, home upkeep, bills |

At the top, a **Morning brief** sums the day up in a few sentences (sync problems first), and **Coming up** lists every dated
item in the next 45 days from all three apps: tasks, exams, road tax, goals and expected payday. Each card shows when its
app last saved to the Sheet, so a broken sync is obvious.

There is also a **Health check** that lists problems in each app's data, such as missing columns, impossible dates,
categories written two ways, a negative debt, money in on a spending category, links to records that don't exist,
duplicates, stale data, and the sync and gold-price failures from each app's own log.
Each problem has **How to fix** steps saying where to fix it (in the app, in the sheet, or nothing to edit), an
**Open row** / **Open tab** button that jumps to the exact place, and **Hide** for problems you accept (on that device).
After fixing, press **Recheck**: the Sheets are read again and the page tells you how many problems cleared.
Sync failures turn into "Recovered" by themselves once the app saves successfully again.
The fix steps live in `apps-script/Fixes.gs`.

## Set up (about 10 minutes)

1. Go to <https://script.google.com> → **New project**, and name it `Dashboard`.
2. Create these files and paste in the contents from `apps-script/`:
   every `.gs` file (`Code`, `Shared`, `Garage`, `Finance`, `Flow`, `Vault`, `Life`, `Budget`, `Trends`, `Fixes`, `Setup`) and an HTML file named `Index`.
   In **Project Settings**, tick *Show "appsscript.json"* and paste in `appsscript.json`.
   (After this first time, use `npm run deploy` instead. See *Publishing changes with one command* below.)
3. **Easiest:** in the editor run **`setupDashboard`**. It finds the Flow, Finance, Garage, Vault, NextRole, Voyage and Nest sheets in your Drive
   by what is inside them (newest copy wins), saves their IDs, links the "Dashboard" sheet and creates the Budget tab.
   Run it again whenever an app moves to a new sheet. It asks for read-only Drive access to look at your sheets.

   Or set them by hand under **Project Settings → Script Properties**:
   - `FLOW_SHEET_ID`: the ID from the Flow Data sheet URL
   - `FINANCE_SHEET_ID`: the ID from the Finance tracker URL
   - `GARAGE_SHEET_ID`: the ID from the Car Tracker URL

   (The ID is the long part of the URL between `/d/` and `/edit`.)

   Optional:
   - `VAULT_SHEET_ID`: the ID of your **Vault Data** sheet (adds the Vault tab, Vault expiry alerts and the Today strip card).
   - `NEXTROLE_SHEET_ID`, `VOYAGE_SHEET_ID`, `NEST_SHEET_ID`: the sheets behind NextRole, Voyage and Nest (fill the Life tab).
   - `DASHBOARD_SHEET_ID`: the ID of your **Dashboard** sheet, for the budget. Then run **`createBudgetTab`** once from the
     editor: it adds a **Budget** tab (Category | Monthly budget) pre-filled with your usual spending; edit the amounts.
     This tab is the only thing the dashboard ever writes, and only when you run that function.

   Also optional, for the **Open app** buttons: add the address you open each app with as
   `FLOW_APP_URL`, `FINANCE_APP_URL`, `GARAGE_APP_URL`, `VAULT_APP_URL`, `NEXTROLE_APP_URL`, `VOYAGE_APP_URL` and
   `NEST_APP_URL` (https links only).
4. In the editor, run **`testDashboard`** once. Google asks you to allow access to your Sheets. (Apps Script needs full Sheets access to open a Sheet by its ID, but the dashboard code never writes.)
   The execution log lists each sheet as OK or FAILED, followed by every issue found.
5. **Deploy → New deployment → Web app**. Set *Execute as: Me* and *Who has access: Only myself*.
   Open the URL, and on your phone use *Add to Home Screen*.

6. Optional, for instant opening: run **`installWarmUp`** once from the editor (it asks for permission to run on a timer).
   From 6am until midnight it re-reads the Sheets every 15 minutes, so the page never waits about 12 seconds for them.

Data is cached for 30 minutes. **Refresh** reads the Sheets again. The page also keeps the last data on your device,
so it shows straight away and updates behind it.

## Phone app (full screen, own icon)

The same dashboard is also published as a home-screen app on GitHub Pages (`docs/`, built from
`apps-script/Index.html` by `npm run build:pages`). It runs full screen with no browser bars and fetches its data
from the web app with a private **access key**.

**The key never goes in a link.** It is typed in once per device and kept in that device's storage. The app sends it
in the body of a POST request, so it does not appear in addresses, history, bookmarks or request logs. The web app
refuses any key passed in a link (`?key=…`), and the page wipes one from the address bar if it finds it.

One-time setup:

1. In the Apps Script editor, run **`createAccessKey`**. Copy the key from the execution log and keep it private
   (a password manager is a good place). Running it again makes a new key and the old one stops working at once.
2. Deploy so the web app is reachable without a Google sign-in: run `npm run deploy` (the manifest sets
   *Who has access: Anyone*), or set it by hand under **Deploy → Manage deployments → ✏️ → Who has access: Anyone**.
   Without the key the web app shows nothing; it never writes to your Sheets.
3. In GitHub: **Settings → Pages → Deploy from a branch**, branch `claude/quirky-albattani-2xi1ko`, folder **/docs**.
4. **iPhone / iPad:** open <https://syahman312.github.io/Dashboard/> in Safari, **Share → Add to Home Screen** first,
   then open it **from the new icon** and enter the web app URL and the key there. (The home-screen app keeps its own
   storage, separate from Safari.)
   **Android:** open the same link in Chrome, enter the URL and key, then **⋮ → Add to Home screen**.
5. **Browser version** (`…/exec`, no key in the address): it asks for the key once and remembers it.

To lock out a lost device or a leaked key, run `createAccessKey` again and enter the new key on your own devices
(footer → **Connection settings**).

The icon lives in `docs/icons/` (`icon.svg` is the source).

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

## Overview

- **Today strip:** tasks and habits due today (Flow), the next Garage reminder, and Vault documents expiring within 30 days.
- **Alerts:** one list of everything that needs action across the apps (failing syncs first, then overdue and expired
  items, then by date): overdue tasks, road tax and insurance, expiring documents, bills due this week, budgets overspent.
- **Money snapshot:** net worth, this month's spend against budget (the line marks where you should be by today) and
  upcoming recurring payments, which are detected from your transactions (charged about monthly, similar amount).
- **Sync health:** when each app last saved to its sheet, and whether its sync is failing.
- **This week:** tasks done, habits kept, study hours, spending and car costs for the last 7 days against the 7 days
  before. Small ▲ ▼ arrows on the cards and tab headers show the same thing: green is better, red is worse.
- **Month review:** the last 3 full months: spent and saved, budget kept or broken per category, tasks done, habits kept,
  study hours and car costs, with a short "went well" and "watch" list. It moves to the top in the first week of a month.

## Life tab

NextRole, Voyage and Nest side by side, between Vault and Health:

- **NextRole:** your next role, ACCA papers passed, goals with progress bars (late ones in red), job applications
  with interviews and next steps, follow-ups after a week with no reply, CPD hours this year and the biggest skill gaps.
- **Voyage:** the next trip with a countdown, spending against its budget (foreign spending converted at the trip's
  rate), to-dos left and overdue, packing progress, the next booking, other planned trips and recent ones.
- **Nest:** days to move-in, must-haves in place, home budget used (bought + ordered), must-haves still to get,
  upkeep tasks overdue or due in 30 days, and monthly bills.

Interviews, late goals, overdue trip to-dos and overdue home tasks also appear in **Alerts**; interviews, trips,
move-in day and upkeep in **Coming up**; and an interview this week, a trip within 30 days or move-in within 60 days
in the **Morning brief**. These apps only save when something changes, so Sync health waits 45 days
(Voyage: 120) before calling them quiet.

Private details are never read: no salary, pay slips, contact details or CV text from NextRole; no hotel address,
booking references or files from Voyage; no links or notes from Nest.

## Budget tab

Its own tab, between Money and Garage. It shows how much is left this month, a daily allowance for the days left,
where the month is heading, and spending against the budget for the last 6 months. Each category can be filtered
(over, ahead of pace, on track), sorted, and opened to see its last 6 months against its budget. Categories you spent
on that have no budget are listed separately. **Edit budget** opens the Budget tab of your Dashboard sheet.

## Quick add

The **+** button (or the **N** key) adds a task, an expense or a fuel fill-up without hunting through the other app:

- **Task:** type it the way Flow's quick add reads it (`Pay TNB bill tmr 9am #home !high`); Flow opens, asks you to confirm,
  and adds it.
- **Expense:** enter the amount and what it was for; Finance opens its new-expense form already filled in. Pick the
  category and account, then Save.
- **Fill-up:** Garage opens straight on its fill-up form.

The dashboard itself still never writes to any app's data: the app does the saving, with its own checks and sync.
It needs the app links (`FLOW_APP_URL`, `FINANCE_APP_URL`, `GARAGE_APP_URL`) in Script Properties, and the Flow and
Finance versions that understand these links (the two small patches in `app-patches/`).

## Works on every device

- **iPhone / Android / iPad:** swipe left or right between tabs. It is a native pager (CSS scroll snap): the next tab
  slides in beside the current one under your finger, with the phone's own momentum and snapping, and each tab
  keeps its own scroll position. Charts and the habit grid keep sideways drags for reading values.
- **iPhone / Android:** tabs at the bottom, 44px tap targets, tap a chart or category to see its numbers,
  pull down to refresh in the home-screen app, works offline with your last data, no zoom when typing.
- **iPad:** two-column layout in portrait and three in landscape; touch-sized controls.
- **PC:** wider layout on large screens; keys **1–8** or **← →** switch tabs, **R** refreshes and **N** opens Quick add.
- **Everywhere:** the Back button moves between tabs, and links like `#money` open that tab.

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
  Vault.gs      Vault Data reader (documents and expiry dates)
  Life.gs       NextRole, Voyage and Nest readers (Life tab)
  Budget.gs     Budget tab: read it, compare with spending, create it
  Trends.gs     weekly trend and month review
  Fixes.gs      how to fix each Health check problem
  Setup.gs      setupDashboard: finds each app's sheet
  Index.html    the page (no build step, no libraries)
docs/CONVENTIONS.md   the rules every app should follow from now on
app-patches/          Quick add hooks for Flow and Finance
test/                 Node tests with fake sheets
dev/                  sample data for previewing the page
```

## Adding a new app

1. Write `NewApp.gs` with `readNewApp_(ss, ctx)` that returns `{ summary, issues }` using the helpers in `Shared.gs`.
2. Add it to `SOURCES` in `Code.gs` and add a Script Property for its Sheet ID.
3. Add a card renderer in `Index.html`.
