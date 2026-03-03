// Simple smoke tests (run with: node tests/smoke.test.mjs)
import assert from "node:assert/strict";

// Copied minimal pure functions to validate logic
function isLeapYear(year){ return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0); }
function daysBetweenInclusiveUTC(start, end){
  const msPerDay=24*60*60*1000;
  const s=Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const e=Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  if (e<s) return 0;
  return Math.floor((e-s)/msPerDay)+1;
}

assert.equal(isLeapYear(2024), true);
assert.equal(isLeapYear(2025), false);

const jan1 = new Date(Date.UTC(2026,0,1));
const jan1b = new Date(Date.UTC(2026,0,1));
const jan2 = new Date(Date.UTC(2026,0,2));
assert.equal(daysBetweenInclusiveUTC(jan1, jan1b), 1);
assert.equal(daysBetweenInclusiveUTC(jan1, jan2), 2);

console.log("Smoke tests passed ✅");
