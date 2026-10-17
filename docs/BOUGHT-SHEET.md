# Bought sheet

Portfolio reads the **Bought** tab. Piecebook never writes to it.

The number `163782451` is the tab id (`gid` in the sheet URL), not the spreadsheet id. Header row 1. Columns are matched by **name**, not by letter. A row with a blank Row ID, or with Row ID, Card or Code equal to `TOTAL`, is skipped. One row is one physical copy. Row ID (`OPB-xxxx`) is the stable key.

Dates may be `YYYY-MM-DD`, `17 Oct 2026`, or `D/M/YYYY`. Slash dates are day/month/year.

## What is shown

- Cost is **All-in SGD** from the sheet. Paid, GST and forwarding are shown when they are not zero. Nothing is converted.
- Market value is recomputed. Raw uses the seed’s ungraded Limitless price for that exact print. PSA 10 uses the OP Box Index sold median only when that same print has a complete row and the copy’s grade is PSA 10. PSA 9 is the same rule, and today the seed has none. Any other grade, or a print with no figure, says **No price yet**. A parallel does not inherit another print’s price.
- The sheet columns **Market value SGD**, **P/L SGD** and **PriceCharting URL** are ignored. PriceCharting data is not fetched.
- USD seed figures become S$ at the dated ECB rate in `data/fx-usd-sgd.json`. A price whose stored date is more than 7 days old is marked stale and still shown.
- Sold rows use the sheet’s sold date, price, currency, sale FX, channel, fees, shipping, net and realized P/L. If realized P/L is blank, it is net minus all-in, both already in S$.
- Overall ROI is unrealized P/L on priced holdings plus realized P/L, divided by the all-in of those copies. Copies with no legal price are left out of P/L and ROI.
- An under-all-in alert fires once per Row ID. It fires again only when the legal price is strictly lower than the last alerted price. Dismissing stores that price in this browser (`piecebook.boughtAlerts.v1`). No legal price means no alert.

Until the key below exists, the screen is `data/bought-fixture.csv` (a sample, not the collection). `data/portfolio-history.csv` is the append-only daily totals table: one row per UTC day, a same-day read replaces that day, older days stay. The first row is the sample. Line items are not committed.

## Secrets

Two names, the same on GitHub Actions and on the Worker:

| Name | Value |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | The whole service-account key file, as JSON. |
| `BOUGHT_SHEET_ID` | The spreadsheet id in `/spreadsheets/d/<id>/edit`. |

Optional: `BOUGHT_SHEET_GID`. Leave it unset to use `163782451`.

There is no env var for the service-account email. It is the `client_email` field inside the JSON key, and it does not exist until that key is created. Share the spreadsheet with that address as **Viewer**.

Do not commit the JSON, do not paste it into chat, and do not print it. The read uses scope `https://www.googleapis.com/auth/spreadsheets.readonly`.

## Steps

1. In Google Cloud, pick or create a project and enable the **Google Sheets API**.
2. IAM → Service Accounts → Create. The project needs no extra role; access to the sheet is the share in step 5.
3. On that account, Keys → Add key → JSON. Download the file.
4. Open the file. Copy `client_email` (it ends in `.iam.gserviceaccount.com`).
5. Open the Bought spreadsheet → Share → paste that email → **Viewer**. Not Editor.
6. From the address bar, copy the spreadsheet id between `/d/` and `/edit`. Confirm the URL also has `gid=163782451`.
7. GitHub → the repo → Settings → Secrets and variables → Actions → New repository secret. Add `GOOGLE_SERVICE_ACCOUNT_JSON` (the entire file) and `BOUGHT_SHEET_ID`. The Seed refresh workflow then appends one totals row to `data/portfolio-history.csv` when it runs. It does not write the sheet. Those totals are cost, value and P/L for the day, not each seller.
8. On the private Worker, from the repo root:

```bash
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON --config worker/wrangler.toml
npx wrangler secret put BOUGHT_SHEET_ID --config worker/wrangler.toml
npm run worker:deploy
```

Paste the JSON when the first command asks. A signed-in phone then loads `GET /api/bought` and replaces the sample. If the read fails, the sample stays and the sheet is left untouched.

Local check, once the two variables are in the environment: `npm run bought:refresh`. With them unset, that command exits 0 and changes nothing.
