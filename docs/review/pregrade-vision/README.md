# Pre-grade photo check (PR review)

Phone 390 (deviceScaleFactor 2) and wide 1280. Worker `/check` is mocked so Gemini and the daily cap are unused.

The mock names the print **JP**. Language sits next to the suggestion; the English-data note is on the page.

```
REVIEW_BASE=http://127.0.0.1:4194 node --experimental-strip-types scripts/review-pregrade-vision.mjs
```
