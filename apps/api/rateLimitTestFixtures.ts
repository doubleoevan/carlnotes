// the rate limit tests' fixtures: Cloudflare's trusted proxies and a Worker's address, and an app behind one limiter
// with the statuses of a burst of requests to it

import { Hono, type MiddlewareHandler } from "hono"
import type { SessionUser } from "./auth"
import type { AppEnv } from "./currentUser"
import { ipAddressOptions } from "./trustedProxies"

// a few of Cloudflare's published ranges, the Workers range among them, read the way production reads TRUSTED_PROXIES
export const CLOUDFLARE_TRUSTED_PROXIES = ["173.245.48.0/20", "172.64.0.0/13", "2606:4700::/32", "2a06:98c0::/29"]

// the address a Worker's request to another zone arrives from, and the client address it resolves to, which keeps the
// address's first 64 bits as Better Auth does
export const CLOUDFLARE_WORKER_ADDRESS = "2a06:98c0:3600::103"
export const CLOUDFLARE_WORKER_CLIENT_ADDRESS = "2a06:98c0:3600:0000:0000:0000:0000:0000"

/**
 * Runs a test body with the process's trusted proxies set to Cloudflare's ranges, as production's are, then clears
 * them.
 */
export async function withCloudflareTrustedProxies(testBody: () => unknown): Promise<void> {
	const trustedProxyCount = ipAddressOptions.trustedProxies.length
	ipAddressOptions.trustedProxies.push(...CLOUDFLARE_TRUSTED_PROXIES)

	// run the body, and clear the ranges whether it passes or not
	try {
		await testBody()
	} finally {
		ipAddressOptions.trustedProxies.splice(trustedProxyCount)
	}
}

/**
 * Returns an app behind one limiter, with the given user signed in or none.
 */
export function toLimitedApp(limiter: MiddlewareHandler<AppEnv>, userId: string | null = null): Hono<AppEnv> {
	// set the signed-in user, or none
	const limitedApp = new Hono<AppEnv>().use(async (context, next) => {
		context.set("user", userId ? ({ id: userId } as SessionUser) : null)
		await next()
	})

	// the limiter, then a route that always succeeds
	return limitedApp.use(limiter).get("/limited", (context) => context.json({ ok: true }))
}

/**
 * Sends requests to the app with the given headers, and returns each status.
 */
export async function toLimitedStatuses(
	limitedApp: Hono<AppEnv>,
	requestCount: number,
	headers: Record<string, string> = {},
): Promise<number[]> {
	const statuses: number[] = []
	for (let i = 0; i < requestCount; i++) {
		statuses.push((await limitedApp.request("/limited", { headers })).status)
	}
	return statuses
}
