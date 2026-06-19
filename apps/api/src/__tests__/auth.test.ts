import { transactionRoutes } from "../routes/transactions.js";

// These exercise the hono/jwk bearer middleware that guards every transaction
// route. All cases below are rejected by the middleware *before* any network
// call to the JWKS endpoint, so they are fully deterministic and offline.
describe("auth middleware — protected transaction routes", () => {
  it("rejects GET /transactions with no Authorization header (401)", async () => {
    const res = await transactionRoutes.request("/");
    expect(res.status).toBe(401);
  });

  it("rejects a non-Bearer Authorization scheme (401)", async () => {
    const res = await transactionRoutes.request("/", {
      headers: { Authorization: "Basic dXNlcjpwYXNzd29yZA==" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a structurally invalid bearer token (401)", async () => {
    const res = await transactionRoutes.request("/", {
      headers: { Authorization: "Bearer not-a-real-jwt" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects POST /transactions/extract without a token (401)", async () => {
    const res = await transactionRoutes.request("/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Amount: -10.00" }),
    });
    expect(res.status).toBe(401);
  });
});
