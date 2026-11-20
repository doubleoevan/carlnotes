// the drain a replica runs when the platform stops it: readiness fails, the platform gets a moment to stop routing to
// the replica, the event streams end so their clients reconnect to a replica that is staying up, the server stops
// listening while the requests in flight finish, and the process flushes what it has buffered

import { isDoneWithin } from "@carlnotes/contracts/time"
import { toWholeNumber } from "@carlnotes/server/envSettings"

// how long a production replica keeps responding after readiness fails, so the platform stops routing to it before it
// stops listening, and how long the requests in flight then get to finish. together they fit a 150-second
// termination grace with time left for the flush
const DEFAULT_ROUTING_GRACE_MS = 5000
const DEFAULT_DRAIN_LIMIT_MS = 120_000

// how long the flush may run. a pool that is still opening a connection never finishes ending
const FLUSH_LIMIT_MS = 10_000

// the part of Bun's server that a drain uses: it stops listening and resolves once its requests have finished, or
// closes them at once if asked to
type ListeningServer = { stop: (closeActiveConnections?: boolean) => Promise<void> }

// whether the drain has started, whether it has ended the event streams, the server that Bun listens on, and how
// each open event stream ends
let isDrainStarted = false
let hasEndedEventStreams = false
let listeningServer: ListeningServer | undefined
const streamEnds = new Set<() => void>()

// how long a drain waits before it stops listening, how long the requests in flight get, and the flush that the
// drain ends with
type DrainOptions = { routingGraceMs: number; drainLimitMs: number; flush: () => Promise<unknown> }

/**
 * Returns whether the replica is draining.
 */
export function isDraining(): boolean {
	return isDrainStarted
}

/**
 * Remembers the server that Bun listens on, which Bun passes with every request. A request from a test passes none.
 */
export function rememberListeningServer(server: ListeningServer | undefined): void {
	listeningServer = server ?? listeningServer
}

/**
 * Registers how an open event stream ends, and returns a call that takes the stream off again once it has closed. A
 * drain ends every registered stream, and a stream that opens after that ends at once, so its client reconnects.
 */
export function endStreamOnDrain(endStream: () => void): () => void {
	if (hasEndedEventStreams) {
		endStream()
		return () => {}
	}
	streamEnds.add(endStream)
	return () => streamEnds.delete(endStream)
}

/**
 * Returns the drain's two waits: API_DRAIN_ROUTING_GRACE_MS, 5 seconds in production and none elsewhere, where no
 * platform routes to the process, and API_DRAIN_LIMIT_MS, 120 seconds.
 */
export function readDrainSettings(): Pick<DrainOptions, "routingGraceMs" | "drainLimitMs"> {
	const defaultRoutingGraceMs = Bun.env.NODE_ENV === "production" ? DEFAULT_ROUTING_GRACE_MS : 0
	return {
		routingGraceMs: toWholeNumber(Bun.env.API_DRAIN_ROUTING_GRACE_MS, defaultRoutingGraceMs),
		drainLimitMs: toWholeNumber(Bun.env.API_DRAIN_LIMIT_MS, DEFAULT_DRAIN_LIMIT_MS),
	}
}

/**
 * Drains the replica once: fails readiness, waits out the routing grace, ends the event streams, stops listening and
 * waits for the requests in flight up to the drain limit, closes any that are left, and runs the flush.
 */
export async function drain({ routingGraceMs, drainLimitMs, flush }: DrainOptions): Promise<void> {
	if (isDrainStarted) {
		return
	}

	// readiness fails from here, and the replica keeps responding while the platform takes it out of its routes
	isDrainStarted = true
	console.log(`draining: readiness fails, and the server stops listening in ${routingGraceMs} ms`)
	await Bun.sleep(routingGraceMs)

	// end the event streams, so each client reconnects to a replica that is staying up
	hasEndedEventStreams = true
	for (const endStream of streamEnds) {
		endStream()
	}
	streamEnds.clear()

	// stop listening and wait for the requests in flight, then close the ones still open at the limit
	const isDrained = await isDoneWithin(listeningServer?.stop() ?? Promise.resolve(), drainLimitMs)
	if (!isDrained) {
		console.warn(`draining: requests were still in flight after ${drainLimitMs} ms and were closed`)
		await listeningServer?.stop(true)
	}

	// send what the process has buffered before it exits. a flush past its limit is left, so the process still exits
	const isFlushed = await isDoneWithin(flush(), FLUSH_LIMIT_MS)
	console.log(isFlushed ? "draining: done" : `draining: the flush was still running after ${FLUSH_LIMIT_MS} ms`)
}
