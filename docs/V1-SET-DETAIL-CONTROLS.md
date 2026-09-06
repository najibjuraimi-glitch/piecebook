# Piecebook — V1 Set detail controls: search, sort, All tab (Design addendum)
As of: 4 Sep 2026 SGT  
Owner: Design  
For: Code (implement)  
Amends: `V1-DESIGN-PACK.md` § Set detail (“Do not: filters, sort menus, search in V1” is lifted for Set detail only)  
Companion: `V1-OWN-AND-SET-DEPTH-UI.md`

Recreated in-repo from the implementation brief; wording follows the brief, nothing added.

## Placement
Under the SetIntro and above the sticky RarityTabs, in this order: SearchField, then one Controls row. Neither is sticky; only the RarityTabs pin.

## SearchField
- Height 44. Placeholder **“Search name or number”**.
- Filters on card name and card number. Number matching accepts `004`, `op09-004` and `OP09-004` alike.
- Clear × appears once there is text.
- Empty result copy (shared with the rarity filter): **“No cards match.”**

## Controls row
Sort select on the left, **`{n} cards`** on the right, where `n` is the count actually shown after search and rarity filtering.

Sort options, in this order:

| Option | Default |
| --- | --- |
| Name · A to Z | |
| Name · Z to A | |
| Price · high to low | **yes** |
| Price · low to high | |

Cards with a null `market_usd` always sort last. Prefer keeping the sort in the URL as `?sort=` so a sorted view can be shared and survives reload.

## RarityTabs
**All** is the first tab and the default on open. Parallels remain visible in All and keep their own Parallels tab. Existing `?rarity=` deep links continue to work.

## Result
Grid = active rarity ∩ search ∩ sort.

Success path: open OP-09 → All is already Price · high to low → type Shanks → see Shanks → Mark owned → card appears in Collection.
