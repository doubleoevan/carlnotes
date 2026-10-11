// the api's tracing middleware, which counts a request's queries and cache reads, names a traced request's transaction
// by its route with the request's gauges, and outside production logs the request and sets its Server-Timing header
import { readEventLoopDelay } from "@shared/eventLoopDelay"
import { completeRequestTransaction, readRequestSpan } from "@shared/monitoring"
import { toReportedPath } from "@shared/reportedPath"
import type { Context } from "hono"
import { createMiddleware } from "hono/factory"
import { routePath } from "hono/route"
import { readPoolGauges } from "../db"
import { readRequestCounts, runWithQueryCount } from "../db/queryTracing"

// the path Hono reports for the ui's catch-all handler, which renders every page
const PAGE_HANDLER_PATH = "/*"

// one request as the log line and the header report it: its method, route, status, and duration,
// then its query count, its cache hit and miss counts, and the keys that missed
export type RequestReport = {
	method: string
	route: string
	status: number
	durationMs: number
	// the counts
	queryCount: number
	cacheHitCount: number
	cacheMissCount: number
	missedCacheKeys: string[]
}

/**
 * Counts a request's queries and cache reads, names a traced request's transaction by its route with its gauges, and
 * outside production sets the Server-Timing header and in dev logs one line per request.
 */
export const traceRequest = createMiddleware(async (context, next) => {
	// a production request Sentry is not recording runs as it is
	const requestSpan = readRequestSpan()
	const isRequestSpanRecording = requestSpan?.isRecording() ?? false
	if (!isRequestSpanRecording && !isServerTimingHeaderSent()) {
		return next()
	}

	// count the queries and the cache reads the rest of the chain sends, and report however the chain ends,
	// so a request that throws is still reported by its route and never by its url
	const startedAt = performance.now()
	await runWithQueryCount(isRequestSpanRecording ? requestSpan : undefined, async () => {
		try {
			await next()
		} finally {
			// name the transaction by its route and attach the request's gauges
			const requestReport = toRequestReport(context, startedAt)
			if (isRequestSpanRecording && requestSpan) {
				completeRequestTransaction({
					requestSpan,
					method: requestReport.method,
					route: requestReport.route,
					measurements: toRequestMeasurements(requestReport.queryCount),
				})
			}

			// set the header outside production
			if (isServerTimingHeaderSent()) {
				context.header("Server-Timing", toServerTimingHeader(requestReport))
			}

			// log the line in dev
			if (isRequestLogLineLogged()) {
				console.log(toRequestLogLine(requestReport))
			}
		}
	})
})

/**
 * Returns the route a request is named by once it has responded: the pattern of the handler that responded,
 * the route shape of a page the ui rendered, or `(not found)` for a page the ui has no route for.
 */
export function toRequestRoute(context: Context): string {
	// every page goes through the ui's one catch-all handler, so a page is named by its route shape
	const handlerPath = routePath(context)
	if (handlerPath !== PAGE_HANDLER_PATH) {
		return handlerPath
	}
	return context.res.status === 404 ? "(not found)" : toReportedPath(context.req.path)
}

// the Server-Timing header for a request: its duration, then its query, cache hit, and cache miss counts
function toServerTimingHeader({ durationMs, queryCount, cacheHitCount, cacheMissCount }: RequestReport): string {
	return [
		`total;dur=${durationMs}`,
		`queries;desc="${queryCount}"`,
		`cache-hits;desc="${cacheHitCount}"`,
		`cache-misses;desc="${cacheMissCount}"`,
	].join(", ")
}

/**
 * Returns a request's log line: its method, route, status, duration, and counts, with the keys that missed if any did.
 */
export function toRequestLogLine(requestReport: RequestReport): string {
	// the counts, then the missed keys if any
	const { method, route, status, durationMs, queryCount, cacheHitCount, cacheMissCount, missedCacheKeys } =
		requestReport
	const countsText = `queries=${queryCount} hits=${cacheHitCount} misses=${cacheMissCount}`
	const missedCacheKeysText = missedCacheKeys.length > 0 ? ` missed=${missedCacheKeys.join(",")}` : ""
	return `${method} ${route} ${status} ${durationMs}ms ${countsText}${missedCacheKeysText}`
}

// the Server-Timing header goes out everywhere but production
function isServerTimingHeaderSent(): boolean {
	return Bun.env.NODE_ENV !== "production"
}

// the request log line is logged in dev alone
function isRequestLogLineLogged(): boolean {
	return isServerTimingHeaderSent() && Bun.env.NODE_ENV !== "test"
}

// the request's report once it has responded, from its counts and the time it started
function toRequestReport(context: Context, startedAt: number): RequestReport {
	return {
		method: context.req.method,
		route: toRequestRoute(context),
		status: context.res.status,
		durationMs: Math.round(performance.now() - startedAt),
		...readRequestCounts(),
	}
}

// the request's measurements: its query count, the pool's counts, and the event loop's lag
function toRequestMeasurements(queryCount: number): Parameters<typeof completeRequestTransaction>[0]["measurements"] {
	const pool = readPoolGauges()
	return {
		"db.query_count": { value: queryCount, unit: "none" },
		"pool.total": { value: pool.totalCount, unit: "none" },
		"pool.idle": { value: pool.idleCount, unit: "none" },
		"pool.waiting": { value: pool.waitingCount, unit: "none" },
		"event_loop.lag": { value: readEventLoopDelay().p99Ms, unit: "millisecond" },
	}
}
