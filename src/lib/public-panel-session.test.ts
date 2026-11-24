import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasPublicPanelSession, signInPublicPanel, signOutPublicPanel } from "./public-panel-session";

function storage() {
  const values = new Map<string, string>();
  return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
}
describe("Public panel real authentication", () => {
  it("passes typed email/password to Auth and marks only a successful session", async () => {
    const s = storage();
    await signInPublicPanel({ signInWithPassword: async credentials => {
      assert.deepEqual(credentials, { email: "panel@example.test", password: "test-only-password" });
      assert.equal(s.getItem("public_admin_session"), null);
      return { data: { session: { user: "test" } }, error: null };
    } }, s, " panel@example.test ", "test-only-password");
    assert.equal(s.getItem("public_admin_session"), "true");
  });
  it("does not grant access after a failed password login", async () => {
    const s = storage(); s.setItem("public_admin_session", "true");
    await assert.rejects(signInPublicPanel({ signInWithPassword: async () => ({ data: { session: null }, error: new Error("invalid") }) }, s, "panel@example.test", "wrong"));
    assert.equal(s.getItem("public_admin_session"), null);
  });
  it("rejects a flag without a verified Auth user", async () => {
    const s = storage(); s.setItem("public_admin_session", "true");
    assert.equal(await hasPublicPanelSession({ getUser: async () => ({ data: { user: null }, error: null }) }, s), false);
    assert.equal(s.getItem("public_admin_session"), null);
  });
  it("accepts the flag only with a verified Auth user", async () => {
    const s = storage(); s.setItem("public_admin_session", "true");
    assert.equal(await hasPublicPanelSession({ getUser: async () => ({ data: { user: { id: "test" } }, error: null }) }, s), true);
  });
  it("cancels requests, clears protected cache and signs out before removing the flag", async () => {
    const s = storage(); s.setItem("public_admin_session", "true");
    const order: string[] = [];
    await signOutPublicPanel({ signOut: async () => { order.push("signOut"); assert.equal(s.getItem("public_admin_session"), "true"); return { error: null }; } }, s, { cancelQueries: async () => { order.push("cancel"); }, clear: () => { order.push("clear"); } });
    assert.deepEqual(order, ["cancel", "clear", "signOut"]);
    assert.equal(s.getItem("public_admin_session"), null);
  });
});