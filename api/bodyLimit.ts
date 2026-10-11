// the middleware a route runs before it reads a request's body: the body limit, and the rejection of a visitor
import type { MiddlewareHandler } from "hono"
import { bodyLimit } from "hono/body-limit"
import { createMiddleware } from "hono/factory"
import { type AppEnv, currentUser } from "./currentUser"

// how large a body may be on a route without a limit of its own
const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024

/**
 * Returns a body limit of the given size that responds to an oversized body with a json 413 before the route reads it.
 */
export function toBodyLimit(maxSizeBytes: number): MiddlewareHandler {
	return bodyLimit({
		maxSize: maxSizeBytes,
		onError: (context) => context.json({ error: "request body too large" }, 413),
	})
}

/**
 * Builds the middleware that rejects a visitor's request with the given error and status before the body is read.
 */
export function toSignedOutRejection(error: string, status: 401 | 404 = 401): MiddlewareHandler<AppEnv> {
	return createMiddleware<AppEnv>(async (context, next) => {
		if (!currentUser(context)) {
			return context.json({ error }, status)
		}
		await next()
	})
}

// the default body limit, for a route without a limit of its own
export const defaultBodyLimit = toBodyLimit(DEFAULT_BODY_LIMIT_BYTES)

// the rejection an upload route gives a visitor, before its body limit buffers the upload
export const uploadSignedOutRejection = toSignedOutRejection("unauthorized")
