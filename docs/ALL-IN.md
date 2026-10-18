# All-in and max bid

Phone page: `/bid`. Portfolio and Watchlist both link to it. A watch row links to `/bid?item=WL-xxxx`, which opens the max-bid side and fills the target.

The rate is typed, with the day it was read. Piecebook does not look up a rate and does not fetch a price. A Japanese figure is not used.

## Forward

Hammer, buyer's premium and seller shipping are in the hammer currency. Premium presets are eBay 0%, Fanatics 20%, Goldin 22%, or a custom percent from 0 to 100.

Auction invoice = hammer + premium + seller shipping.

That invoice converts at the typed rate (S$ per 1 unit). SGD needs no rate. The forwarder fee is already in S$ (a Portland fee goes in this box).

GST, when the 9% switch is on, is 9% of the converted invoice plus the forwarder fee. All-in is the converted invoice, the forwarder fee and GST, added in S$.

## Reverse

The target is an all-in in S$. The page solves the highest hammer, to the cent, whose all-in is still at or under that target. The same lines are shown at that hammer.

From a watch row, the target is that row's `targetSgd`. When the row has no target, it is 0.9 times the manual English figure (`marketSgd`), and the line shows that figure's source, date and stale flag. An undated manual figure is stale. A stored seed quote is not the 0.9 basis.
