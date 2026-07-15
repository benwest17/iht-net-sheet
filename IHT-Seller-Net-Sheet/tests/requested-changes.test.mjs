import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
assert.equal(/Total commission/i.test(source), false, "Total commission line still appears in the seller sheet source");
assert.ok(/Listing agent commission/i.test(source), "Listing agent commission line is missing");
assert.ok(/Buyer[’']s agent commission/i.test(source), "Buyer agent commission line is missing");
console.log("PASS: total commission line removed; individual commission lines remain");
