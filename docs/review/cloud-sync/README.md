# Cloud sync, backup and import — review shots (PR #37)

Taken against the real dev stack: `npm run dev` (Vite, `/api` proxied) + `npx wrangler dev --env dev`
with `ACCESS_DEV_IDENTITY=najibjuraimi@gmail.com` and an empty on-disk KV. Phone is 390 × 844 @2x,
wide is 1280 × 900. The flow runs in order across two browser contexts (phone, wide) that share
only the Worker.

| File | What it shows |
|---|---|
| `phone-first-login.png` | Cloud empty, device holds 3 owned / 1 deck / 1 watching → the upload offer strip on Collection; nothing is pushed yet |
| `wide-first-login.png` | Same moment at 1280 |
| `phone-your-data-held.png` | Your data while held: *Upload this device's data* / *Keep local for now* |
| `phone-your-data-synced.png` | After the tap: Synced, signed-in email, last-synced time |
| `wide-your-data-synced.png` | The wide context reloaded and pulled the phone's upload (3 owned cards) |
| `wide-collection-synced.png` | Collection foot line *Synced to cloud · Your data* |
| `phone-import-confirm.png` | A backup file chosen: counts in the file vs on the device, exported date, origin, then *Replace and import* / *Cancel* |
| `phone-import-done.png` | After confirm: *Imported 2 items: collection and costs, pre-grade log.* |
| `phone-collection-synced.png` | Collection after the import (5 cards from the file; the watchlist, which the file did not carry, is untouched) |
| `phone-moved-banner.png` | The old site built with `VITE_MOVED_TO`: *Piecebook has moved* with *Download my data* |
| `wide-moved-banner.png` | Same at 1280 |
