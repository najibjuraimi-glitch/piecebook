# All-in and max bid

Phone page: `/bid`. Portfolio and Watchlist both link to it. A watch row links to `/bid?item=WL-xxxx`, which opens the max-bid side and fills the target.

The rate is typed, with the day it was read. Piecebook does not look up a rate and does not fetch a price. A Japanese figure is not used.

## Forward

Hammer, buyer's premium and seller shipping are in the hammer currency. Premium presets are eBay 0%, Fanatics 20%, Goldin 22%, or a custom percent from 0 to 100.

Auction invoice = hammer + premium + seller shipping.

The payment fee is a percent of that invoice, still in the hammer currency. Choosing eBay, Fanatics or Goldin also sets the fee: 0%, 2.9% or about 3%. The fee buttons stay put once you tap one, so ACH can stay at 0%. The fee is its own line. The amount that converts is the invoice plus that fee.

That charge converts at the typed rate (S$ per 1 unit). SGD needs no rate. The forwarder fee is already in S$ (a Portland fee goes in this box).

The import is the converted charge plus the forwarder fee. GST Auto, the default, adds 9% only when that import is over S$400. On and Off override Auto. A lot within S$20 of S$400, or an override that disagrees with Auto, says so. All-in is the import plus GST.

Fanatics seller shipping is US$15 when the hammer plus premium is US$750 to US$1,500, and US$25 from US$1,500 to US$3,000. A blank field uses that tier only inside the band. Outside it, the page asks you to type the shipping from the Fanatics checkout and does not guess US$0 or another tier. A typed amount overrides the tier.

## Reverse

The target is an all-in in S$. The page solves the highest hammer, to the cent, whose all-in is still at or under that target, including the payment fee and the GST jump at S$400. The same lines are shown at that hammer.

From a watch row, the target is that row's `targetSgd`. When the row has no target, it is 0.9 times the manual English figure (`marketSgd`). The line is tagged EN and shows the source, date and stale flag. A stale or undated figure is not filled in until you tap **Use this target**. A stored seed quote is not the 0.9 basis.
