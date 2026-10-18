/**
 * English stored prices for the Worker. The seed CSVs are bundled as text.
 * A Japanese OP Box Index median is not returned.
 */
import { printsFromSeedRows, quoteStored, rowsFromSeedTexts } from "../../src/lib/storedQuotes.ts";
import { SEED_TEXTS } from "./seedCsvs.js";

const rows = rowsFromSeedTexts(SEED_TEXTS);
const prints = printsFromSeedRows(rows.values());

export function storedQuote(code, grade) {
  return quoteStored(rows, code, grade);
}

export function seedPrints() {
  return prints;
}
