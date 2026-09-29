// the per-request query count and the span of each statement a request sends, kept in the request's async context
import { AsyncLocalStorage } from "node:async_hooks"
import type { Pool, PoolClient } from "@neondatabase/serverless"
import { type Span, startQuerySpan } from "@shared/monitoring"

// how many statements one request has sent, and the request's span that their spans are parented to
type RequestQueries = { queryCount: number; requestSpan: Span | undefined }

// the running request's query count, open for as long as the request runs
const requestQueryStore = new AsyncLocalStorage<RequestQueries>()

/**
 * Runs a request with its own query count, and parents the span of each statement it sends to the request's span.
 */
export function runWithQueryCount<Result>(requestSpan: Span | undefined, runRequest: () => Result): Result {
	return requestQueryStore.run({ queryCount: 0, requestSpan }, runRequest)
}

/**
 * Returns how many statements the running request has sent so far, or zero outside a request.
 */
export function readQueryCount(): number {
	return requestQueryStore.getStore()?.queryCount ?? 0
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

// wraps a client's query, so each statement sent during a traced request is counted and traced under that request
function traceClientQueries(client: PoolClient): void {
	const sendQuery = client.query.bind(client) as (...queryArguments: unknown[]) => unknown
	client.query = ((...queryArguments: unknown[]) => {
		// a statement outside any request, such as a Scan's, is neither counted nor traced
		const requestQueries = requestQueryStore.getStore()
		if (!requestQueries) {
			return sendQuery(...queryArguments)
		}
		requestQueries.queryCount += 1
		if (!requestQueries.requestSpan) {
			return sendQuery(...queryArguments)
		}

		// the query's span, which ends when the statement's result returns
		const endQuerySpan = startQuerySpan(toStatement(queryArguments[0]), requestQueries.requestSpan)
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
