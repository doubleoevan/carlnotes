// the per-request query count, cache reads, and the span of each statement a request sends, kept in the request's
// async context
import { AsyncLocalStorage } from "node:async_hooks"
import { type Span, startQuerySpan } from "@carlnotes/server/monitoring"
import type { Pool, PoolClient } from "@neondatabase/serverless"
import { clearRequestMemo } from "./requestMemo"

// a statement that changes rows: an insert, an update, or a delete, alone or inside a with statement
const WRITE_STATEMENT_PATTERN = /^\s*(insert|update|delete)\b|^\s*with\b[\s\S]*\b(insert|update|delete)\b/i

// how many statements one request has sent, its cache hits and misses with the keys that missed,
// and the request's span that the statement spans are parented to
type RequestCounts = {
	queryCount: number
	cacheHitCount: number
	cacheMissCount: number
	missedCacheKeys: string[]
	requestSpan: Span | undefined
}

// one cache read to count: a hit, or a miss with its key
export type CountCacheReadOptions = { isHit: boolean; key: string }

// the counts outside any request
const NO_REQUEST_COUNTS: RequestCounts = {
	queryCount: 0,
	cacheHitCount: 0,
	cacheMissCount: 0,
	missedCacheKeys: [],
	requestSpan: undefined,
}

// the running request's counts, open for as long as the request runs
const requestQueryStore = new AsyncLocalStorage<RequestCounts>()

/**
 * Runs a request with its own query and cache read counts, and parents the span of each statement it sends to the
 * request's span.
 */
export function runWithQueryCount<Result>(requestSpan: Span | undefined, runRequest: () => Result): Result {
	return requestQueryStore.run(
		{ queryCount: 0, cacheHitCount: 0, cacheMissCount: 0, missedCacheKeys: [], requestSpan },
		runRequest,
	)
}

/**
 * Returns the running request's counts so far: its statements, its cache hits and misses, and the keys that missed.
 * Outside a request every count is zero.
 */
export function readRequestCounts(): Omit<RequestCounts, "requestSpan"> {
	// return the counts without the span
	const { queryCount, cacheHitCount, cacheMissCount, missedCacheKeys } =
		requestQueryStore.getStore() ?? NO_REQUEST_COUNTS
	return { queryCount, cacheHitCount, cacheMissCount, missedCacheKeys }
}

/**
 * Counts one cache read toward the running request, with the key of a miss. Outside a request nothing is counted.
 */
export function countCacheRead({ isHit, key }: CountCacheReadOptions): void {
	// count nothing outside a request
	const requestQueries = requestQueryStore.getStore()
	if (!requestQueries) {
		return
	}

	// count a hit, or a miss with its key
	if (isHit) {
		requestQueries.cacheHitCount += 1
		return
	}
	requestQueries.cacheMissCount += 1
	requestQueries.missedCacheKeys.push(key)
}

/**
 * Counts one statement toward the running request, after clearing the request's memo if the statement writes.
 * Returns the request's counts, or null outside a request.
 */
export function countRequestStatement(statement: string): RequestCounts | null {
	// a write clears the request's memo, so the request's next read of the user's access or a topic role goes to the database
	if (WRITE_STATEMENT_PATTERN.test(statement)) {
		clearRequestMemo()
	}

	// count the statement toward the running request
	const requestQueries = requestQueryStore.getStore()
	if (requestQueries) {
		requestQueries.queryCount += 1
	}
	return requestQueries ?? null
}

/**
 * Counts and traces each statement a pool's clients send while a request's query count is open.
 * A statement sent on a client the request waited for still counts toward that request.
 */
export function traceQueries(pool: Pool): void {
	// the request that releases a client completes a waiting checkout,
	// so the checkout's callback is bound to the context of the request that asked for it
	const connectToPool = pool.connect.bind(pool) as (callback?: (...checkoutArguments: unknown[]) => void) => unknown
	pool.connect = ((callback?: (...checkoutArguments: unknown[]) => void) =>
		connectToPool(callback && AsyncLocalStorage.bind(callback))) as Pool["connect"]

	// each new client counts and traces its statements from its first one
	pool.on("connect", (client: PoolClient) => {
		traceClientQueries(client)
	})
}

// wraps a client's query, so each statement sent during a traced request is counted and traced under that request,
// and a write clears the memo of the request that sent it
function traceClientQueries(client: PoolClient): void {
	const sendQuery = client.query.bind(client) as (...queryArguments: unknown[]) => unknown
	client.query = ((...queryArguments: unknown[]) => {
		// count the statement, and send it untraced outside any request, such as a Scan's, or without a request span
		const statement = toStatement(queryArguments[0])
		const requestQueries = countRequestStatement(statement)
		if (!requestQueries?.requestSpan) {
			return sendQuery(...queryArguments)
		}

		// the query's span, which ends when the statement's result returns
		const endQuerySpan = startQuerySpan(statement, requestQueries.requestSpan)
		const callback = queryArguments.at(-1)
		try {
			// a callback-style query ends its span in its callback
			if (typeof callback === "function") {
				return sendQuery(...queryArguments.slice(0, -1), (...callbackArguments: unknown[]) => {
					endQuerySpan()
					callback(...callbackArguments)
				})
			}

			// a promise-style query ends its span once the promise finishes, and a query with no promise ends its span at once
			const queryResult = sendQuery(...queryArguments)
			if (queryResult instanceof Promise) {
				return queryResult.finally(endQuerySpan)
			}
			endQuerySpan()
			return queryResult
		} catch (error) {
			// a query that throws before it is sent ends its span at once
			endQuerySpan()
			throw error
		}
	}) as PoolClient["query"]
}

// a statement's text, from the query's text or its config, which never includes the values bound to it
function toStatement(queryConfig: unknown): string {
	if (typeof queryConfig === "string") {
		return queryConfig
	}
	const statementText = (queryConfig as { text?: unknown } | undefined)?.text
	return typeof statementText === "string" ? statementText : "query"
}
