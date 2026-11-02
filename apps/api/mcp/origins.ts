// the browser origins allowed to call the two mcp transport endpoints
import { appUrl } from "@carlnotes/server/appUrl"
import type { MiddlewareHandler } from "hono"
import type { AppEnv } from "../currentUser"

/** Rejects a present foreign Origin before the MCP request reaches account work. */
export const validateMcpOrigin: MiddlewareHandler<AppEnv> = async (context, next) => {
	// server-side clients omit Origin. a present header must match a complete serialized origin
	const origin = context.req.raw.headers.get("origin")
	if (origin === null || origin === "https://carlnotes.com") {
		return next()
	}

	// a configured deployment must still be an HTTP(S) origin
	const configuredUrl = new URL(appUrl())
	const isHttpOrigin = configuredUrl.protocol === "https:" || configuredUrl.protocol === "http:"
	if (isHttpOrigin && origin === configuredUrl.origin) {
		return next()
	}
	return context.json({ error: "origin not allowed" }, 403)
}
