# Watchlist

A target is a print, a grade, and a price in S$ Jib wants to pay. It is not the starred list on Collection (`piecebook.watchlist.v1`). Nothing is seeded. The chase rows CH-001..CH-006 are not in this repo, so the book starts empty. Cards adds a row when it has one. Piecebook does not invent a print, a grade, or a price.

Rows live in the Worker’s `USER_DATA` KV, behind the same Cloudflare Access login as holdings.

`u:<OWNER_EMAIL>:watchlist.v1` is the book. `u:<OWNER_EMAIL>:watchlist-history.v1` is the write log. A service token has no email, so it uses `OWNER_EMAIL`, the same key Jib’s phone reads. Another Access email is a different book.

## What a row stores

`id` (`WL-xxxx`), print code, target grade (`Raw`, `PSA 9`, or `PSA 10`), target price SGD, notes, and the date it was added. Piecebook assigns the next `WL-xxxx` when the id is omitted. An id the caller sends is kept. `CH-001` is not an id.

## The price on a row

The current price is the English stored price for that print and grade, the same figure Portfolio uses. Raw is the seed’s ungraded Limitless price. PSA 10 or PSA 9 is used only when the stored printing is English. The price uses the card number inside the code (`OP09-004` inside `OP09-004 SP`). The row still shows the code that was saved.

The read includes `priceSgd`, `source`, and `asOf`. When there is no English price, `priceSgd` is null and `priceLabel` is **No price yet**. A Japanese OP Box Index median is never a watchlist price and never a hit.

`hit` is true when that price is at or under the target. A price dated more than 7 days ago is marked `stale` and still shown. No price is not a hit and is not marked stale.

## Phone

Portfolio links to Watchlist. **Add a target** (`/watchlist/new`), **Edit target** (`/watchlist/:id`), and **Remove** on the edit form. The list shows the price, its source and date, **No price yet**, **At or under target**, and **Stale, older than 7 days**.

## Agent API

Same host as the rest of the private API: `https://piecebook.pages.dev/api`. A browser sends its Access cookie. Cards sends the service token headers it already uses for `/sync`. The token is never printed and must not be committed.

A service token may add, edit, and remove watchlist rows even while `SERVICE_TOKEN_WRITE` is `0`. That flag still blocks `/sync` writes.

Every write sends the `revision` from the last GET. A stale revision is `409 revision_conflict`. Every write appends one line to the history: `at` (UTC), `caller`, `op` (`create`, `patch`, `delete`), and `rowId`. The caller is the service token’s client id (the Access JWT `common_name`) or the signed-in Access email. The client secret is not stored.

```bash
H=(-H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET")

curl -s "${H[@]}" "$PIECEBOOK_API/watchlist"

curl -s "${H[@]}" -X POST "$PIECEBOOK_API/watchlist" -H 'Content-Type: application/json' \
  -d '{"revision":0,"code":"OP09-004","grade":"Raw","targetSgd":5,"notes":"","added":"2026-10-17"}'

curl -s "${H[@]}" -X PATCH "$PIECEBOOK_API/watchlist/WL-0001" -H 'Content-Type: application/json' \
  -d '{"revision":1,"targetSgd":4}'

curl -s "${H[@]}" -X DELETE "$PIECEBOOK_API/watchlist/WL-0001" -H 'Content-Type: application/json' \
  -d '{"revision":2}'
```

`GET /watchlist` returns `{ source, revision, items, writes }`. An item’s stored fields are `id`, `code`, `grade`, `targetSgd`, `notes`, `added`. The read adds `priceSgd`, `source`, `asOf`, `priceLabel`, `hit`, and `stale`.

## Alerts

`GET /alerts` is what Cards polls. It returns the under-all-in hits from the holdings book and the watchlist hits from this book, for the same owner.

An under-all-in hit fires once per Row ID when the active price (English or manual) is under all-in, and again only when that price is strictly lower. A watchlist hit fires when the English price is at or under the target, and again only on a strictly lower price. No price means no hit.

Dismissals are stored at `u:<email>:alerts.v1`, so they hold on every device. The sample Portfolio book still uses this browser’s `piecebook.boughtAlerts.v1` until a signed-in read succeeds.

```bash
curl -s "${H[@]}" "$PIECEBOOK_API/alerts"

curl -s "${H[@]}" -X POST "$PIECEBOOK_API/alerts/dismiss" -H 'Content-Type: application/json' \
  -d '{"revision":0,"underAllIn":["OPB-0001"],"watchlist":["WL-0001"]}'
```

`GET /alerts` returns `{ source, revision, underAllIn, watchlist, writes }`. A dismiss names the ids currently firing. The stored price is the one Piecebook just computed, not a number the caller sends.
