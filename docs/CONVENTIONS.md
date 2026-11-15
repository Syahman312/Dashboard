# Shared conventions for all my apps

These rules come from building the dashboard, which has to read Garage, Finance and Flow the same way.
Every new app (and every fix to an old one) should follow them, so the dashboard and future apps
can read its Sheet without special cases. The helpers in `apps-script/Shared.gs` follow these rules;
copy that file into a new app's Apps Script project.

## 1. Sheet layout

- **One tab per list**, a header row in row 1 and one record per row. No merged cells, no blank header cells.
- **The first two columns are `ID` and `Updated`.**
  - `ID`: a stable random string the app creates and never reuses.
  - `Updated`: epoch milliseconds of the last change (used for sync conflicts).
- **Deleting a record**: remove the row and append `{Time (ms), List, ID, When}` to a `_Deleted` tab (as Flow does).
  Avoid a `deleted` flag on live rows. Garage does this today, and old rows pile up.
- **App diagnostics** go in a `_Log` tab with the columns `Time | Source | Level | Area | Message | Detail`.
  `Level` is `info`, `warn` or `error`. (Finance's `Log` tab uses different column names; rename it to match when convenient.)
- A private store for the app (Finance `_data`, the Garage `json` column) is fine, but **always also write readable columns**,
  because those are what the dashboard and other apps read.

## 2. Values

| Kind | Write it as | Example | Not |
|---|---|---|---|
| Date | `yyyy-MM-dd` text | `2026-11-15` | `11/15/2026`, `15/11/26`, `0021-03-02` |
| Timestamp | ISO 8601 with offset, **or** epoch ms | `2026-11-15T08:30:00+08:00` | `11/15/2026` (date only) |
| Time of day | `HH:mm` (24h) | `18:30` | `6.30pm`, `9am` |
| Money | plain number in RM, 2 dp | `-20.30` | `RM 20.30`, `(20.30)` |
| Sign | **negative = money out / owed**, positive = money in | spending `-12.50` | Mixing signs in one column |
| Debt | positive number in `Owed` | `9844.26` | `-9844.26` for some rows only |
| Yes/No | `TRUE` / `FALSE` checkbox | `TRUE` | `yes`, `x`, `1` |
| Duration | whole minutes, header says `(min)` | `45` | `0:45`, `45m` |

Time zone: **Asia/Kuala_Lumpur** everywhere (set it in each Sheet's settings and in `appsscript.json`).

## 3. Categories

- One list of categories, each with **one icon and one name**: `🍽️ Food & Drinks`, not also `🍔 Food & Drinks` or `🍜 Food`.
- Transfers between your own accounts and balance adjustments get **their own categories**
  (`🤝 Transfer`, `⚖️ Balance adjustment`) and are never left blank. The dashboard leaves both out of spending.
- Garage service items and Finance categories that describe the same thing should use the same words
  (e.g. `⛽ Fuel` in Finance and `fuel` entries in Garage), so the cross-app check can match them.

## 4. Apps Script pattern

Each app's script follows the same shape:

```
doGet(e)            -> serves the page (HtmlService)
doPost(e)           -> sync endpoint for the PWA (JSON in, JSON out)
readTable_(ss, tab) -> rows as objects keyed by header   (Shared.gs)
toISODate_/toAmount_/toBool_                             (Shared.gs)
log_(level, area, message, detail) -> appends to _Log
```

- Return JSON with `ContentService` and `{ ok: true, data }` or `{ ok: false, error }`. Never return a bare string.
- Apps Script's `SpreadsheetApp.openById` needs the full `spreadsheets` scope; `spreadsheets.readonly` is rejected. A read-only app enforces that in code by never calling a write method.

## 5. Style

All apps share the same dark palette as Wallet: background `#0f1115`, cards `#171a21`, accent `#4f8cff`,
green `#3ecf8e`, amber `#f5b74e`, red `#ff6b6b`. They also share the system font stack and 14px corner radius.
The CSS variables at the top of `apps-script/Index.html` are the source to copy.
