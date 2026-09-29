// the gauges each long-running process logs once a minute, and the Sentry warnings a crossed threshold sends
import { readEventLoopDelay, resetEventLoopDelay, startEventLoopDelay } from "./eventLoopDelay"
import { reportThresholdCrossing, type ThresholdCrossing } from "./monitoring"

// how often a process logs its gauges
const REPORT_INTERVAL_MS = 60_000

// the event loop delay past which a minute sends a warning, in milliseconds
const EVENT_LOOP_DELAY_ALERT_MS = 200

// the connection pool's three counts: its open clients, the idle ones, and the requests waiting for one
export type PoolGauges = { totalCount: number; idleCount: number; waitingCount: number }

// what a process adds to its minute line, such as the worker's scan queue, with the thresholds it crossed
export type ExtraGaugesReading = { gauges: Record<string, unknown>; thresholdCrossings: ThresholdCrossing[] }

// the process a reporter logs for, how it reads its pool, and what it adds each minute
type RuntimeGaugesOptions = {
	processName: "api" | "worker"
	readPoolGauges: () => PoolGauges
	readExtraGauges?: () => Promise<ExtraGaugesReading>
}

/**
 * Starts the event loop delay histogram and logs the process's gauges once a minute.
 * The timer never keeps the process alive.
 */
export function startRuntimeGauges(runtimeGaugesOptions: RuntimeGaugesOptions): void {
	startEventLoopDelay()
	setInterval(() => {
		void reportRuntimeGauges(runtimeGaugesOptions)
	}, REPORT_INTERVAL_MS).unref()
}

/**
 * Logs one line of the process's gauges, resets the event loop delay's window,
 * and sends a warning for each threshold crossed. Returns the line and the crossings.
 */
export async function reportRuntimeGauges({
	processName,
	readPoolGauges,
	readExtraGauges,
}: RuntimeGaugesOptions): Promise<{ line: Record<string, unknown>; thresholdCrossings: ThresholdCrossing[] }> {
	// read this minute's pool and event loop delay, then start the next minute's window
	const pool = readPoolGauges()
	const eventLoopDelay = readEventLoopDelay()
	resetEventLoopDelay()

	// what the process adds, where a failed read is logged and leaves the rest of the line intact
	const extraGauges = await (readExtraGauges?.() ?? Promise.resolve({ gauges: {}, thresholdCrossings: [] })).catch(
		(error: unknown) => {
			console.error("could not read the extra gauges", error)
			return { gauges: {}, thresholdCrossings: [] }
		},
	)

	// log the line, then warn for each threshold the minute crossed
	const line = {
		gauges: "runtime",
		process: processName,
		pool,
		eventLoopDelayMs: eventLoopDelay,
		...extraGauges.gauges,
	}
	const thresholdCrossings = [
		...toRuntimeThresholdCrossings({ pool, eventLoopDelay }),
		...extraGauges.thresholdCrossings,
	]
	console.log(JSON.stringify(line))
	for (const thresholdCrossing of thresholdCrossings) {
		reportThresholdCrossing(thresholdCrossing)
	}
	return { line, thresholdCrossings }
}

// the pool and the event loop delay a minute read, to check against their thresholds
type RuntimeThresholdOptions = { pool: PoolGauges; eventLoopDelay: { p99Ms: number; maxMs: number } }

/**
 * Returns the thresholds a minute's pool and event loop delay crossed:
 * a request waiting for a connection, and a delay past 200 ms.
 */
export function toRuntimeThresholdCrossings({ pool, eventLoopDelay }: RuntimeThresholdOptions): ThresholdCrossing[] {
	// a request waiting for a connection means the pool has too few connections
	const poolCrossings: ThresholdCrossing[] =
		pool.waitingCount > 0
			? [{ condition: "pool-waiting", message: "a request waited for a database connection", values: { ...pool } }]
			: []

	// a delay this long stalls every request the process is serving
	const eventLoopCrossings: ThresholdCrossing[] =
		eventLoopDelay.maxMs > EVENT_LOOP_DELAY_ALERT_MS
			? [
					{
						condition: "event-loop-delay",
						message: "the event loop stalled past 200 ms",
						values: { ...eventLoopDelay },
					},
				]
			: []
	return [...poolCrossings, ...eventLoopCrossings]
}
