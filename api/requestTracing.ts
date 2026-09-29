// the api's first middleware, which names a traced request's transaction by its route and attaches the request's gauges
import { readEventLoopDelay } from "@shared/eventLoopDelay"
import { completeRequestTransaction, readRequestSpan } from "@shared/monitoring"
import { toReportedPath } from "@shared/reportedPath"
import type { Context } from "hono"
import { createMiddleware } from "hono/factory"
import { routePath } from "hono/route"
import { readPoolGauges } from "../db"
import { readQueryCount, runWithQueryCount } from "../db/queryTracing"

// the path Hono reports for the ui's catch-all handler, which renders every page
const PAGE_HANDLER_PATH = "/*"

/**
 * Counts a traced request's queries, then names its transaction by its route and attaches the query count,
 * the pool's counts, and the event loop's lag.
 * An untraced request runs with nothing counted.
 */
export const traceRequest = createMiddleware(async (context, next) => {
	// a request Sentry is not recording, and every request without Sentry, runs as it is
	const requestSpan = readRequestSpan()
	if (!requestSpan?.isRecording()) {
		return next()
	}

	// count the queries the rest of the chain sends, and name the transaction however the chain ends,
	// so a request that throws is still reported by its route and never by its url
	await runWithQueryCount(requestSpan, async () => {
		try {
			await next()
		} finally {
			// name the transaction by its route, and attach the request's gauges
			const pool = readPoolGauges()
			completeRequestTransaction({
				requestSpan,
				method: context.req.method,
				route: toRequestRoute(context),
				measurements: {
					"db.query_count": { value: readQueryCount(), unit: "none" },
					"pool.total": { value: pool.totalCount, unit: "none" },
					"pool.idle": { value: pool.idleCount, unit: "none" },
					"pool.waiting": { value: pool.waitingCount, unit: "none" },
					"event_loop.lag": { value: readEventLoopDelay().p99Ms, unit: "millisecond" },
				},
			})
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
