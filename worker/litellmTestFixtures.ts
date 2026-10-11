// the LiteLLM test fixtures: the stub proxy, the connection pool stub that keeps the call order, the user row, and the
// setup and restore that each LiteLLM test file runs around every test
import { type Mock, mock, spyOn } from "bun:test"
import * as monitoring from "@shared/monitoring"
import { saveEnvSettings } from "@shared/savedEnvSettings"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "../db/connectionPoolStub"

// the real fetch, the connection pool's own query, and the proxy settings, put back after each test
const originalFetch = globalThis.fetch
const restoreEnvSettings = saveEnvSettings(["LITELLM_BASE_URL", "LITELLM_MASTER_KEY"])

/**
 * Sets the proxy settings that the config check requires, and empties the stub call order.
 */
export function setUpLiteLLMTest(): void {
	Bun.env.LITELLM_BASE_URL = "http://litellm.test"
	Bun.env.LITELLM_MASTER_KEY = "master"
	stubCallOrder.length = 0
}

/**
 * Leaves the run the way it was found: the real fetch, the connection pool's own query, the proxy settings, no mock.
 */
export function restoreLiteLLMTest(): void {
	globalThis.fetch = originalFetch
	restoreConnectionPool()
	restoreEnvSettings()
	mock.restore()
}

// a request that the stubbed proxy was sent
export type ProxyRequest = { path: string; body: unknown; signal: AbortSignal | null | undefined }

// each stubbed query's first word and each stubbed proxy request's path, in the order that the stubs were called
export const stubCallOrder: string[] = []

/**
 * Stubs the connection pool with the rows that toQueryRows picks, keeping each query's first word in the call order,
 * and returns the queries that the stub is sent. A toQueryRows that throws an error makes that query fail.
 */
export function stubConnectionPoolInCallOrder(toQueryRows: (sentQuery: SentQuery) => unknown[][]): SentQuery[] {
	return stubConnectionPool((sentQuery) => {
		stubCallOrder.push(sentQuery.text.split(" ")[0] ?? "")
		return toQueryRows(sentQuery)
	})
}

/**
 * Swaps fetch for a stub proxy that returns the response that toResponse builds for each request's path, and returns
 * the requests that the stub proxy is sent.
 */
export function stubProxy(toResponse: (path: string) => Response): ProxyRequest[] {
	const proxyRequests: ProxyRequest[] = []
	globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		// keep the request and its path, then return the response for that path
		const path = new URL(String(input)).pathname
		proxyRequests.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined, signal: init?.signal })
		stubCallOrder.push(path)
		return toResponse(path)
	}) as typeof fetch
	return proxyRequests
}

/**
 * Quiets the console and the error report, and returns the spy on the error report.
 */
export function quietErrorReports(): Mock<typeof monitoring.reportError> {
	spyOn(console, "error").mockImplementation(() => {})
	return spyOn(monitoring, "reportError").mockImplementation(() => {})
}

/**
 * Quiets the console and the error report, and swaps fetch for a stub proxy that responds to every request with a 500.
 */
export function stubFailingProxy(): ProxyRequest[] {
	quietErrorReports()
	return stubProxy(() => new Response("proxy error", { status: 500 }))
}

/**
 * Returns a user row that loadLiteLLMKeyOwner selects, with its email, key, role, plan, and a $12.34 budget override.
 */
export function toUserRow(litellmVirtualKey: string | null): unknown[] {
	return ["carl@example.com", litellmVirtualKey, "user", "free", 1234]
}
