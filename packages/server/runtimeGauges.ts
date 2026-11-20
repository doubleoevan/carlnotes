// the gauges each long-running process logs once a minute, and the Sentry warnings a crossed threshold sends
import { hostname } from "node:os"
import { readEventLoopDelay, resetEventLoopDelay, startEventLoopDelay } from "./eventLoopDelay"
import { reportThresholdCrossing, type ThresholdCrossing } from "./monitoring"

// how often a process logs its gauges
const REPORT_INTERVAL_MS = 60_000

// the event loop delays that send a warning from the api or the web service, in milliseconds. one stall past
// 2 seconds, or a 99th percentile past 100 ms, which only repeated stalls reach
const EVENT_LOOP_STALL_ALERT_MS = 2000
const EVENT_LOOP_P99_ALERT_MS = 100

// the connection pool's three counts: its open clients, the idle ones, and the requests waiting for one
export type PoolGauges = { totalCount: number; idleCount: number; waitingCount: number }

// what a process adds to its minute line, such as the worker's scan queue, with the thresholds it crossed
export type ExtraGaugesReading = { gauges: Record<string, unknown>; thresholdCrossings: ThresholdCrossing[] }

// the name a process logs its gauges under: the app service's api, the web service, or the worker
type RuntimeProcessName = "api" | "web" | "worker"

// what a stalled event loop's warning says, for each process that serves requests. the worker has none, because its
// delays only go in its minute line
const EVENT_LOOP_STALL_MESSAGES: Partial<Record<RuntimeProcessName, string>> = {
	api: "the api's event loop stalled",
	web: "the web service's event loop stalled",
}

// the process a reporter logs for, how it reads its pool, and what it adds each minute
type RuntimeGaugesOptions = {
	processName: RuntimeProcessName
	readPoolGauges: () => PoolGauges
	readExtraGauges?: () => Promise<ExtraGaugesReading>
}

// the bytes in the megabyte that the line's resident memory is counted in
const BYTES_PER_MB = 1024 * 1024

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

	// log the line, then warn for each threshold that the minute crossed.
	// the instance field names the replica by its host name, and the resident memory is the process's own, without
	// its child processes
	const line = {
		gauges: "runtime",
		process: processName,
		instance: hostname(),
		residentMemoryMb: Math.round(process.memoryUsage.rss() / BYTES_PER_MB),
		pool,
		eventLoopDelayMs: eventLoopDelay,
		...extraGauges.gauges,
	}
	const thresholdCrossings = [
		...toRuntimeThresholdCrossings({ processName, pool, eventLoopDelay }),
		...extraGauges.thresholdCrossings,
	]
	console.log(JSON.stringify(line))
	for (const thresholdCrossing of thresholdCrossings) {
		reportThresholdCrossing(thresholdCrossing)
	}
	return { line, thresholdCrossings }
}

// the process that read them, and the pool and the event loop delay a minute read, to check against their thresholds
type RuntimeThresholdOptions = {
	processName: RuntimeGaugesOptions["processName"]
	pool: PoolGauges
	eventLoopDelay: { p99Ms: number; maxMs: number }
}

/**
 * Returns the thresholds a minute's pool and event loop delay crossed: a request waiting for a connection,
 * and on the api and the web service a stall past 2 seconds or a 99th percentile delay past 100 ms.
 */
export function toRuntimeThresholdCrossings({
	processName,
	pool,
	eventLoopDelay,
}: RuntimeThresholdOptions): ThresholdCrossing[] {
	// a request waiting for a connection means the pool has too few connections
	const poolCrossings: ThresholdCrossing[] =
		pool.waitingCount > 0
			? [{ condition: "pool-waiting", message: "a request waited for a database connection", values: { ...pool } }]
			: []

	// a delay this long stalls every request the process is serving
	const isEventLoopStalled =
		eventLoopDelay.maxMs > EVENT_LOOP_STALL_ALERT_MS || eventLoopDelay.p99Ms > EVENT_LOOP_P99_ALERT_MS

	// only a process that serves requests has a message, so only it warns
	const eventLoopStallMessage = EVENT_LOOP_STALL_MESSAGES[processName]
	const eventLoopCrossings: ThresholdCrossing[] =
		eventLoopStallMessage && isEventLoopStalled
			? [{ condition: "event-loop-delay", message: eventLoopStallMessage, values: { ...eventLoopDelay } }]
			: []
	return [...poolCrossings, ...eventLoopCrossings]
}
