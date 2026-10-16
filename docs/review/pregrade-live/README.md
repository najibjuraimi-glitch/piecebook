# Pre-grade live-test fixes

Phone 390 (deviceScaleFactor 2). Real eBay Nami OP09-070 photos. Worker `/check` mocked as `parallel_guess: base` with SPECIAL in `read_text`.

- `phone-candidates.png` — confirm list; OP09-070 says `no price for this version` (not the UC $0.19).
- `phone-worksheet-fold.png` — carried front + seed line on the worksheet.
- `phone-worksheet-back.png` — carried back (same session, no second upload).
- `phone-worksheet.png` — full page.

```
REVIEW_BASE=http://127.0.0.1:4195 node --experimental-strip-types scripts/review-pregrade-live.mjs
```
