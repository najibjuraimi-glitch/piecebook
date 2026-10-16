# Street price: `GET /price` and `GET /street`

One endpoint for both desks. Real sources only. Every figure carries its source URL and the date it was pulled, in US dollars and in Singapore dollars at a dated European Central Bank rate. A source the Worker cannot read says so instead of guessing. These are reference prices, never an offer: Piecebook never buys, bids or offers.

Lives in `worker/src/price.js`. Behind Cloudflare Access like `/sync`; the read-only service token is enough because the route is GET only.

## Ask

Both spellings land on the same code.

```
GET /api/price?card=OP05-119&variant=SP&lang=EN&grade=PSA10     Auction's shape
GET /api/street?code=EB02-010&variant=alt&grade=raw|psa10        Cards' shape
```

| Parameter | Values | Notes |
| --- | --- | --- |
| `card` or `code` | `EB02-010`, `OP05-119p4`, `op05-119_p2` | A print suffix on the number (`p1`…`p9`) wins over `variant`. |
| `variant` | `base` (default), `alt` (also `aa`, `alternate art`, `parallel`, `p1`), `SP`, `manga`, `box topper`, `treasure rare`, `full art`, `textured foil`, `pirate foil`, `p2`…`p9`, `any` | Matched against TCGplayer's own labels (`(Alternate Art)`, `(Parallel)`, `(SP)`, `(Manga)`). `any` lists every print and gives no single street figure. |
| `lang` | `EN` (default) | Only English prices exist. Another value is answered with EN figures and a note. |
| `grade` | `raw` (default), `psa9`, `psa10` (any case, `PSA 10` works) | TCGplayer is raw only. Graded figures need PriceCharting. |
| `fresh` | `1` | Skip the cached answer. |

From the Linux box, as an agent:

```bash
H=(-H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET")
curl -s "${H[@]}" "$PIECEBOOK_API/street?code=EB02-010&variant=alt&grade=raw" | jq '.street, .fx.asOf'
curl -s "${H[@]}" "$PIECEBOOK_API/price?card=OP05-119&variant=any" | jq '.prints'
```

## Answer

```jsonc
{
  "query":  { "card": "EB02-010", "variant": "alt", "lang": "EN", "grade": "raw" },
  "print":  { "cardNumber": "EB02-010p1", "setCode": "EB-02", "name": "Monkey.D.Luffy", "variant": "Alternate Art",
              "tcgplayerProductId": 629101, "url": "https://www.tcgplayer.com/product/629101/…" },
  "prints": [ { "cardNumber": "EB02-010", "label": "Base", "marketUsd": 0.43, "marketSgd": 0.55, "url": "…" }, … ],
  "street": { "usd": 1033.15, "sgd": 1325.43, "grade": "raw", "source": "tcgplayer", "url": "…",
              "asOf": "2026-10-15", "pulledAt": "2026-10-16T09:00:00.000Z" },
  "sources": {
    "tcgplayer":     { "status": "ok", "grade": "raw", "usd": { "market": 1033.15, "low": 1007.16, "mid": 1398.9 },
                       "sgd": { … }, "asOf": "2026-10-15", "pulledAt": "…", "url": "…",
                       "via": "https://tcgcsv.com/tcgplayer/68/23834/prices",
                       "source": "TCGplayer market price (via TCGCSV, a once-a-day mirror of TCGplayer's API)" },
    "pricecharting": { "status": "not_configured", "grade": "raw", "note": "Needs PRICECHARTING_TOKEN …", "url": "https://www.pricecharting.com/search-products?…" },
    "ebay_sold":     { "status": "not_configured", "note": "Recent sold comps need eBay developer keys …" },
    "collectr":      { "status": "unavailable", "note": "Collectr publishes no API. …" }
  },
  "fx":    { "status": "ok", "base": "USD", "quote": "SGD", "rate": 1.2829, "asOf": "2026-10-15", "pulledAt": "…",
             "source": "European Central Bank euro foreign-exchange reference rates (EUR/SGD ÷ EUR/USD)",
             "url": "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml", "note": "Not a bank quote." },
  "notes": [],
  "cache": { "hit": false, "ttlSeconds": 21600 },
  "disclaimer": "Reference prices with a source and a date. Not an offer. Piecebook never buys, bids or offers."
}
```

`street` is the one headline figure: TCGplayer market for `grade=raw`, PriceCharting for `psa9` and `psa10`. It is `null` when no source carries the grade asked for, and `notes` says why.

### Source statuses

| Status | Meaning |
| --- | --- |
| `ok` | A real figure with `usd`, `sgd`, `asOf`, `pulledAt`, `url`. |
| `unavailable` | The source could not be read from the Worker, or lists no such print or price. `note` says which. Nothing is cached in its place. |
| `not_configured` | The source needs a key that is not set. `note` names the secret. |
| `not_applicable` | The source does not carry the grade asked for (TCGplayer for `psa10`). |
| `list` | `variant=any`: every print is in `prints`, no single figure. |

When several TCGplayer prints share a label (OP05-119 `alt` is both the OP-05 `p1` and the PRB-01 reprint `p4`), the lowest print number is chosen and `sources.tcgplayer.note` says so; ask by print number for another.

## Sources, and what works from a Worker

| Source | Works today | How | Key |
| --- | --- | --- | --- |
| TCGplayer market (raw) | Yes | TCGCSV (`tcgcsv.com`), a once-a-day public mirror of TCGplayer's API, within its guidelines: identified User-Agent, cached six hours. The card → product map is the refresh's own `data/tcgplayer-products.csv`, bundled into the Worker. Sets with no roster group (EB-04) are found through TCGCSV's group abbreviations (`OP15-EB04`). | None |
| ECB rate (USD → SGD) | Yes | `eurofxref-daily.xml`, EUR/SGD ÷ EUR/USD, dated by the cube, cached twelve hours. If the ECB cannot be read, the last committed table in `data/fx-usd-sgd.json` is used and the answer says so with its date. | None |
| PriceCharting (ungraded, Grade 9, PSA 10) | Wired, off until a token is set | `/api/products?t=…&q=one piece <number> <label>`, then PriceCharting's documented card fields: `loose-price` ungraded, `graded-price` Grade 9, `manual-only-price` PSA 10, all in pennies. | `PRICECHARTING_TOKEN` (paid API): `npx wrangler secret put PRICECHARTING_TOKEN --config worker/wrangler.toml` |
| eBay sold comps | No | Needs eBay developer keys with Marketplace Insights access, which is application-only. Not wired; the block says `not_configured` and nothing is invented in its place. | `EBAY_APP_ID`, `EBAY_CERT_ID`, plus Insights approval |
| Collectr | No | Publishes no API. Its app reads TCGplayer market daily, which is the `tcgplayer` block. | n/a |

## Cache

KV, under the `VISION_CAP` binding unless a `PRICE_CACHE` namespace is bound in `worker/wrangler.toml` (optional, keeps caches apart from the daily counters).

| Key | TTL |
| --- | --- |
| `price:v1:<card>|<variant>|<lang>|<grade>` whole answer, only when at least one source is `ok` | 6 h |
| `tcgcsv:groups` | 24 h |
| `tcgcsv:group:<id>` products and prices for one TCGplayer group | 6 h |
| `fx:ecb:v1` | 12 h |

## Tests

`worker/test/price.test.ts` runs on recorded TCGCSV and ECB shapes: both query spellings, variant and print-number matching, shared labels, reprint sets, FX parsing and the dated fallback, PriceCharting field mapping and token handling, every `unavailable` path, KV caching, and the Access fail-closed route.
