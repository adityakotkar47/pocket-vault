import { Hono } from "hono";

export const transactionRoutes = new Hono();

transactionRoutes.get("/", (c) => c.json({ data: [], nextCursor: null }));
transactionRoutes.post("/extract", (c) => c.json({ message: "not implemented" }, 501));
