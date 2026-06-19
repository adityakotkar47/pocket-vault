import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./lib/auth.js";
import { transactionRoutes } from "./routes/transactions.js";
import { requireEnv } from "./lib/env.js";
import { authLimiter } from "./lib/rate-limit.js";

const app = new Hono();

const WEB_ORIGIN = requireEnv("WEB_ORIGIN");

// All API access is server-to-server (Next.js Server Actions + Auth.js
// authorize). CORS is kept as a safety net for any browser-origin request.
app.use(
  "/api/*",
  cors({
    origin: WEB_ORIGIN,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS", "DELETE", "PUT", "PATCH"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

// ── Auth endpoints (the contract the assignment specifies) ───────────────────
// Thin wrappers over Better Auth's server API. signUpEmail hashes the password
// (scrypt) and fires the org-provisioning hook; /login returns the 7-day ES256
// JWT directly, so the frontend never touches Better Auth's native routes.
app.post("/api/auth/register", authLimiter, async (c) => {
  const { email, password, name } = await c.req.json<{ email: string; password: string; name?: string }>();
  if (!email || !password) {
    return c.json({ error: "email and password are required" }, 400);
  }
  try {
    const result = await auth.api.signUpEmail({
      body: { email, password, name: name?.trim() || email.split("@")[0] },
    });
    return c.json(
      { user: { id: result.user.id, email: result.user.email, name: result.user.name } },
      201,
    );
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Registration failed" }, 400);
  }
});

app.post("/api/auth/login", authLimiter, async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (!email || !password) {
    return c.json({ error: "email and password are required" }, 400);
  }
  try {
    const signIn = await auth.api.signInEmail({ body: { email, password } });
    if (!signIn?.token) {
      return c.json({ error: "Invalid email or password" }, 401);
    }
    // Exchange the session token for the ES256 JWT the API verifies via JWKS.
    const { token } = await auth.api.getToken({
      headers: new Headers({ authorization: `Bearer ${signIn.token}` }),
    });
    return c.json(
      {
        token,
        user: { id: signIn.user.id, email: signIn.user.email, name: signIn.user.name },
        expiresIn: 7 * 24 * 60 * 60,
      },
      200,
    );
  } catch {
    return c.json({ error: "Invalid email or password" }, 401);
  }
});

// JWKS is the only Better Auth HTTP route we still expose — the transaction
// middleware fetches it to verify ES256 JWTs statelessly.
app.get("/api/auth/jwks", (c) => auth.handler(c.req.raw));

app.route("/api/transactions", transactionRoutes);

app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

const PORT = Number(process.env.PORT ?? 3001);

Bun.serve({ fetch: app.fetch, port: PORT });
console.log(`API running on http://localhost:${PORT}`);

export default app;
export type AppType = typeof app;
