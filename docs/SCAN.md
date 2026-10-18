# Case scan

Phone page: `/scan`. Portfolio links to it. `POST /api/scan` is the same call for a service token.

Send one photo: a camera shot, an upload, or an `imageUrl`. The URL is fetched only as an image. The listing page is not opened, and the photo is not stored. **Save scan** keeps the reading on the phone, not the bytes.

The vision Worker finds each card, reads a slab label before the card face, and returns a box, a grid position, a print guess, a language, a sticker, and a condition estimate. The estimate is not a grade and not a PSA prediction. **Close-up check** opens `/pregrade` for a front and back of one card.

A card is priced only when the language was read as English, the print is one exact id, the confidence is at least 0.8, and the stored English quote is fresh. Anything else says **No price yet** and stays out of the lot sum. A Japanese card, including a label that says JP even when the set name says EN, is not given an English price. A sticker more than 10% under a fresh English street price is marked under street. A caption can place prices in grid order, including `1288 (Sequential x4)` and `X` for not for sale.

**Max lot offer** opens `/bid` with the target set to 0.9 times the fresh English street total of the cards that clear. The rate, fees and GST are still typed there. The offer is not a bid.
