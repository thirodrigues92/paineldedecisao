import { describe, expect, it } from "bun:test";
import { feegowIntegerId } from "./feegow-identifiers";

describe("Feegow integer identifiers", () => {
  it("rejects the fractional agreement ID that blocked November imports without rounding", () => {
    expect(feegowIntegerId("35.70000076293945")).toBeNull();
  });
  it("preserves valid agreement identifiers", () => {
    expect(feegowIntegerId("35")).toBe(35);
    expect(feegowIntegerId(0)).toBe(0);
  });
  it("keeps missing or out-of-range identifiers null", () => {
    expect(feegowIntegerId(null)).toBeNull();
    expect(feegowIntegerId(2147483648)).toBeNull();
  });
});