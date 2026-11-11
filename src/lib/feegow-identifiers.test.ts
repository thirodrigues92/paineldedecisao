import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { feegowIntegerId } from "./feegow-identifiers";

describe("Feegow integer identifiers", () => {
  it("rejects the fractional agreement ID that blocked November imports without rounding", () => {
    assert.equal(feegowIntegerId("35.70000076293945"), null);
  });
  it("preserves valid agreement identifiers", () => {
    assert.equal(feegowIntegerId("35"), 35);
    assert.equal(feegowIntegerId(0), 0);
  });
  it("keeps missing or out-of-range identifiers null", () => {
    assert.equal(feegowIntegerId(null), null);
    assert.equal(feegowIntegerId(2147483648), null);
  });
});