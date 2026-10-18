# Watchlist

A target is a print, a grade, and a price in S$ Jib wants to pay. It is not the star on a card (`piecebook.watchlist.v1`). Nothing is seeded. The chase rows CH-001..CH-006 are not in this repo, so the book starts empty. Cards adds a row when it has one. Piecebook does not invent a print, a grade, or a price.

Rows live in the Worker’s `USER_DATA` KV, behind the same Cloudflare Access login as holdings.

`u:<OWNER_EMAIL>:watchlist.v1` is the book. `u:<OWNER_EMAIL>:watchlist-history.v1` is the write log. A service token has no email, so it uses `OWNER_EMAIL`, the same key Jib’s phone reads. Another Access email is a different book.

## What a row stores

`id` (`WL-xxxx`), print code, target grade (`Raw`, `PSA 9`, or `PSA 10`), target price SGD (or null), notes, the date it was added, an optional `externalId` (`CH-001` … `CH-006`), an optional PriceCharting link, and an optional manual market (`marketSgd`, `marketAsOf` as a real `yyyy-mm-dd` on or before today in Asia/Singapore, `marketSource`, `marketUrl`). Cards types the manual figure. Piecebook does not fetch PriceCharting. Piecebook assigns the next `WL-xxxx` when the id is omitted, and does not assign an id again after it is removed. An id the caller sends is kept. `CH-001` is an `externalId`, not the row id. The same print and grade cannot be stored twice. `Near Mint` and `Ungraded` are not grades here. Removing a row clears that id's alert dismissal and does not change the alerts revision.

The code has to be one seed print id, such as `EB03-053p2` or `OP09-004`. `OP09-004 SP` is rejected with `ambiguous_print` and the list of print ids that word could mean. Send `OP09-004p3`, not the words.

## The price on a row

The current price is a fresh English stored price for that exact print and grade, then the manual market figure labeled with its source and date, then **No price yet**. Raw is the seed’s ungraded Limitless price. PSA 10 or PSA 9 is used only when the stored printing is English. A variant word is not priced as the base print. A stale English quote does not block the manual figure. When the manual figure is the only price, or the English quote is stale and a manual figure is saved, the manual figure is the price.

Every row includes `priceSgd`, `url`, `source`, `asOf`, and `stale`. When neither price exists, `priceSgd` is null and `priceLabel` is **No price yet**. A Japanese OP Box Index median is never a watchlist price and never a hit. A manual figure with no date, or a date that is not a real day, is stale and does not fire. A date after today in Asia/Singapore is rejected. When `marketSgd` is set, `marketSource` and an `https` `marketUrl` are required. `http` is not a link. Changing the print or the grade clears the four manual fields.

`hit` is true only when there is a target and the price is at or under it and the price is not stale. A null target is not a hit. A price dated more than 7 days ago is marked `stale`, still shown, and is not a hit. No price is not a hit and is not marked stale.

`GET /watchlist?format=targets` returns `{ id, print, parallel, language, grade, targetSgd, externalId, marketSgd, marketAsOf, marketSource, marketUrl, priceSgd, source, asOf, url, stale, hit }` for each row. `priceSgd`, `source`, `asOf`, `url`, `stale`, and `hit` are the price the row would show. Auction uses that list to scan. `parallel` is the seed’s variant label, or null on a base print. A capital P in a print id (`EB03-053P2`) is the same print as `EB03-053p2`. A Limitless link for a parallel is omitted; it is never the base card’s page.

## Phone

Portfolio links to Watchlist. **Add a target** (`/watchlist/new`), **Edit target** (`/watchlist/:id`), and **Remove** on the edit form. The list and the edit form show the price, its source and date, **No price yet**, **At or under target**, and **Stale, older than 7 days**. A price dated more than 7 days ago is stale. A price from 7 days ago is not.

## Agent API

Same host as the rest of the private API: `https://piecebook.pages.dev/api`. A browser sends its Access cookie. Cards sends the service token headers it already uses for `/sync`. The token is never printed and must not be committed.

A service token may add, edit, and remove watchlist rows even while `SERVICE_TOKEN_WRITE` is `0`. That flag still blocks `/sync` writes. `WRITE_CLIENT_IDS`, when set to a comma-separated list of service-token client ids (the Access JWT `common_name`), is the only service tokens that may write holdings, the watchlist, or alert dismissals. A signed-in phone is still allowed. When the variable is empty, it is not checked.

Every write sends the `revision` from the last GET. A stale revision is `409 revision_conflict`. Every write appends one line to the history: `at` (UTC), `caller`, `op` (`create`, `patch`, `price`, `delete`), and `rowId`. The caller is the service token’s client id (the Access JWT `common_name`) or the signed-in Access email. The client secret is not stored.

```bash
H=(-H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET")

curl -s "${H[@]}" "$PIECEBOOK_API/watchlist"

curl -s "${H[@]}" -X POST "$PIECEBOOK_API/watchlist" -H 'Content-Type: application/json' \
  -d '{"revision":0,"code":"OP09-004","grade":"Raw","targetSgd":5,"notes":"","added":"2026-10-17"}'

curl -s "${H[@]}" -X PATCH "$PIECEBOOK_API/watchlist/WL-0001" -H 'Content-Type: application/json' \
  -d '{"revision":1,"targetSgd":4}'

# Sets marketSgd, marketAsOf, marketSource and marketUrl together. Same revision check as PATCH.
curl -s "${H[@]}" -X POST "$PIECEBOOK_API/watchlist/WL-0001/price" -H 'Content-Type: application/json' \
  -d '{"revision":2,"marketSgd":40,"marketAsOf":"2026-10-17","marketSource":"Cards","marketUrl":"https://www.pricecharting.com/game/one-piece/nami"}'

curl -s "${H[@]}" -X DELETE "$PIECEBOOK_API/watchlist/WL-0001" -H 'Content-Type: application/json' \
  -d '{"revision":3}'
```

`GET /watchlist` returns `{ source, revision, items, writes }`. An item’s stored fields are `id`, `code`, `grade`, `targetSgd`, `notes`, `added`, `marketSgd`, `marketAsOf`, `marketSource`, and `marketUrl`. The read adds `priceSgd`, `source`, `asOf`, `priceLabel`, `hit`, and `stale`.

## Alerts

Cards polls `GET /alerts`. Piecebook does not push alerts. The response is the under-all-in hits from the holdings book and the watchlist hits from this book, for the same owner. Each alert has `type` (`underAllIn` or `watchlist`), `url`, `source`, `asOf`, `stale`, `firedAt`, and `dismissed`. A watchlist hit also has `externalId`, `marketSgd`, `marketAsOf`, `marketSource`, and `marketUrl`. `firedAt` is stamped once when that price is a new low, and a later GET of the same price does not move it. GET writes that stamp only when it is new, and only if the alerts revision is still the one it read, so a dismiss is not overwritten. `?since=` is an ISO timestamp; only alerts whose `firedAt` is later than that are returned. `?includeDismissed=1` and `?includeDismissed=true` also return alerts that already fired at this price. Without it, those stay out.

An under-all-in hit fires once per Row ID when the active price (English or manual) is under all-in, and again only when that price is strictly lower. A watchlist hit fires when the active price (fresh English, or else the manual figure) is at or under the target, and again only on a strictly lower price. A stale manual figure does not fire. No price means no hit. Deleting the holding or the watch row clears that alert’s `firedAt` and its dismissal, and does not change the alerts revision.

Dismissals are stored at `u:<email>:alerts.v1`, so they hold on every device. The sample Portfolio book still uses this browser’s `piecebook.boughtAlerts.v1` until a signed-in read succeeds.

```bash
curl -s "${H[@]}" "$PIECEBOOK_API/alerts"

curl -s "${H[@]}" -X POST "$PIECEBOOK_API/alerts/dismiss" -H 'Content-Type: application/json' \
  -d '{"revision":0,"underAllIn":["OPB-0001"],"watchlist":["WL-0001"]}'
```

`GET /alerts` returns `{ source, revision, underAllIn, watchlist, writes }`. A dismiss names the ids currently firing. The stored price is the one Piecebook just computed, not a number the caller sends.
