# Holdings

Piecebook is the source of record for Jib’s copies. The Google Sheet is not read, and there is no service account. A CSV export of the old Bought tab can be imported once.

Rows live in the Worker’s existing `USER_DATA` KV, behind the same Cloudflare Access login as the rest of the private app. One row is one physical copy. Row ID (`OPB-xxxx`) is assigned by Piecebook and does not change. The phone shows `data/bought-fixture.csv` until a signed-in read of `GET /api/holdings` succeeds. That file is a sample, not the collection.

`data/portfolio-history.csv` is only the sample day’s totals. The real daily snapshot is stored next to the rows: one totals row per UTC day, a same-day write replaces that day, older days stay. Opening Portfolio records today. Line items are not written into the repo.

## What a row stores

Date, card, code, grade/raw, where/seller, paid / GST / forwarding / all-in SGD, a manual market value SGD with its source and date, notes, an optional PriceCharting link, status Held / Listed / Sold, and for a sale: sold date, price, currency, sale FX, channel, fees, shipping out, net, realized P/L.

## How a copy is valued

1. An English stored price for that exact print and grade. Raw is the seed’s ungraded Limitless price. PSA 10 or PSA 9 is used only when the stored printing is English.
2. Otherwise the manual market value, labeled with the source that was saved (a Bought CSV import labels it `Sheet (Cards)`) and its date.
3. Otherwise **No price yet**.

A Japanese OP Box Index median is never a Portfolio value, including for P/L, ROI and the under-all-in alert. A parallel does not inherit another print. The manual figure is Jib’s own number, shown back to him. Piecebook does not fetch or store PriceCharting data. The link, when there is one, is only a click-through.

USD seed figures become S$ at the dated ECB rate in `data/fx-usd-sgd.json`. A price dated more than 7 days ago is marked stale and still shown. A manual figure with no date is marked undated and stale.

Sold rows use the saved sale fields. If realized P/L was left blank, it is net minus all-in, both already in S$. If net was left blank, it is the sold price converted with the sale FX (SGD needs no FX) minus fees and shipping.

Overall ROI is unrealized P/L on priced holdings plus realized P/L, divided by the all-in of those copies. Copies with no price are left out of P/L and ROI.

Holdings group only when Code and the Grade/Raw text both match. PSA 10 and raw of the same card are separate lines. Each line expands to its Row IDs.

An under-all-in alert fires once per Row ID when the active price (English or manual) is under all-in. It fires again only when that price is strictly lower than the last alerted price. Dismissing stores that price in this browser (`piecebook.boughtAlerts.v1`). No price means no alert.

## Phone

Portfolio → **Add a copy**, **Edit**, **Mark sold**. **Import CSV** reads a Bought-tab export (header row 1, columns by name). A second import is refused unless you confirm replace. Blank Row ID rows and a `TOTAL` row are skipped.

## Agent API

Same host as the rest of the private API: `https://piecebook.pages.dev/api`. Cloudflare Access in front. A browser sends its Access cookie. An agent sends the service token headers it already uses for `/sync`. The token is never printed by the Worker and must not be committed.

A service token may add and update holdings even while `SERVICE_TOKEN_WRITE` is `0`. That flag still blocks `/sync` writes. `/whoami` keeps reporting `readOnly: true` for the token; that flag is about sync, not this book.

Every write sends the `revision` from the last GET. A stale revision is `409 revision_conflict`. Row IDs already in the book are not reused.

```bash
H=(-H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET")

# The book. copies are stored fields, not valued. The phone applies the English price.
curl -s "${H[@]}" "$PIECEBOOK_API/holdings"

# Add. revision 0 on an empty book. Row ID is omitted unless the caller already has an OPB-xxxx.
curl -s "${H[@]}" -X POST "$PIECEBOOK_API/holdings" -H 'Content-Type: application/json' \
  -d '{"revision":0,"card":"Nami","code":"ST01-007","grade":"Raw","date":"2026-10-17","where":"Shop","paidSgd":2,"allInSgd":2,"marketValueSgd":null,"marketSource":"","marketAsOf":null,"status":"Held"}'

# Update one row.
curl -s "${H[@]}" -X PATCH "$PIECEBOOK_API/holdings/OPB-0001" -H 'Content-Type: application/json' \
  -d '{"revision":1,"notes":"desk"}'

# Mark sold. Blank net and realized are filled in S$.
curl -s "${H[@]}" -X POST "$PIECEBOOK_API/holdings/OPB-0001/sold" -H 'Content-Type: application/json' \
  -d '{"revision":2,"soldDate":"2026-10-17","soldPrice":8,"currency":"SGD","feesSgd":0.4,"shippingOutSgd":1}'

# One-time CSV import. 409 already_imported if the book is not empty. Add "replace": true to overwrite the rows.
curl -s "${H[@]}" -X POST "$PIECEBOOK_API/holdings/import" -H 'Content-Type: application/json' \
  -d '{"revision":0,"csv":"Row ID,Code,Grade/Raw,All-in SGD,Status,Card\nOPB-0001,ST01-007,Raw,2,Held,Nami\n"}'

# Daily totals. asOf must be today UTC. Same day replaces that day.
curl -s "${H[@]}" -X POST "$PIECEBOOK_API/holdings/snapshot" -H 'Content-Type: application/json' \
  -d '{"asOf":"2026-10-17","heldCopies":1,"listedCopies":0,"soldCopies":0,"costSgd":2,"marketSgd":0.9,"unpricedHeld":0,"unrealizedSgd":-1.1,"realizedSgd":null,"overallSgd":-1.1,"capitalSgd":2,"roi":-0.55}'

curl -s "${H[@]}" "$PIECEBOOK_API/holdings/history"
```

`GET /holdings` returns `{ source, revision, copies, history }`. A copy’s fields are `rowId`, `date`, `card`, `code`, `grade`, `where`, `paidSgd`, `gstSgd`, `forwardingSgd`, `allInSgd`, `marketValueSgd`, `marketSource`, `marketAsOf`, `notes`, `priceChartingUrl`, `status` (`Held` | `Listed` | `Sold`), `soldDate`, `soldPrice`, `currency`, `saleFx`, `channel`, `feesSgd`, `shippingOutSgd`, `netSgd`, `realizedSgd`.

Status codes: `400` bad field or date, `401` no Access session, `404` unknown Row ID, `409` stale revision, duplicate Row ID, or a second import, `503` Access or `USER_DATA` is not configured. No new secret. Deploy the Worker as in `docs/CLOUDFLARE-SETUP.md`. The KV namespace is already bound.
