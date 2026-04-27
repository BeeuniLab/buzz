import { Hono } from "hono";

import { Env } from "./core-utils";

export function userRoutes(app: Hono<{ Bindings: Env }>) {
	app.get("/api/test", (c) => c.json({ success: true, data: { name: "this works" } }));
}
