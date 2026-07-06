import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./lib/auth.js";
import { transactionRoutes } from "./routes/transactions.js";
import { requireEnv } from "./lib/env.js";
import { authLimiter } from "./lib/rate-limit.js";

const app = new Hono();

const WEB_ORIGIN = requireEnv("WEB_ORIGIN");

app.use(
  "/api/*",
  cors({
    origin: WEB_ORIGIN,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

app.post("/api/auth/register", authLimiter, async (c) => {
  const { email, password, name } = await c.req.json<{
    email: string;
    password: string;
    name?: string;
  }>();
  if (!email || !password) {
    return c.json({ error: "email and password are required" }, 400);
  }
  try {
    const result = await auth.api.signUpEmail({
      body: { email, password, name: name?.trim() || email.split("@")[0] },
    });
    return c.json(
      {
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
        },
      },
      201,
    );
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Registration failed" },
      400,
    );
  }
});

app.post("/api/auth/login", authLimiter, async (c) => {
  const { email, password } = await c.req.json<{
    email: string;
    password: string;
  }>();
  if (!email || !password) {
    return c.json({ error: "email and password are required" }, 400);
  }
  try {
    const signIn = await auth.api.signInEmail({ body: { email, password } });
    if (!signIn?.token) {
      return c.json({ error: "Invalid email or password" }, 401);
    }
    const { token } = await auth.api.getToken({
      headers: new Headers({ authorization: `Bearer ${signIn.token}` }),
    });
    return c.json(
      {
        token,
        user: {
          id: signIn.user.id,
          email: signIn.user.email,
          name: signIn.user.name,
        },
        expiresIn: 7 * 24 * 60 * 60,
      },
      200,
    );
  } catch {
    return c.json({ error: "Invalid email or password" }, 401);
  }
});

app.get("/api/auth/jwks", (c) => auth.handler(c.req.raw));

app.route("/api/transactions", transactionRoutes);

app.get("/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() }),
);

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";

export default {
  fetch: app.fetch,
  port: PORT,
  hostname: HOST,
};
console.log(`API running on http://${HOST}:${PORT}`);

export type AppType = typeof app;
