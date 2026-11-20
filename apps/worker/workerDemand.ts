// the demand gauges a worker serves at its Prometheus endpoint, which the platform's autoscaling reads: the work this
// replica holds, and its share of what waits in the queue. the replicas' average is then the whole demand over the
// replicas, which the autoscaler compares with one replica's slots

import { TOPIC_VIDEO_BACKFILL_TASK_QUEUE, TOPIC_VIDEO_TASK_QUEUE } from "@carlnotes/contracts/topicVideoWork"
import { SCAN_TASK_QUEUE, SCHEDULED_SCAN_TASK_QUEUE } from "@carlnotes/pipeline/scanWorkflowClient"
import { describeTaskQueue, type TaskQueueDescription } from "@carlnotes/pipeline/temporalTaskQueues"
import { toPositiveInteger } from "@carlnotes/server/envSettings"
import { reportError } from "@carlnotes/server/monitoring"
import type { WorkerQueueGroup } from "./workerQueueGroup"

// the port the gauges are served on if WORKER_METRICS_PORT sets none, and the path a scrape requests
const DEFAULT_METRICS_PORT = 9464
const METRICS_PATH = "/metrics"

// how long scrapes share one read of Temporal, so many scrapes at once make one describe call
const GAUGES_CACHE_MS = 5000

// one demand gauge: its metric's name and help line, the queues whose backlogs it shares out, and the queues whose
// activities in progress on this replica it counts
type DemandGauge = { name: string; help: string; backlogTaskQueues: string[]; inFlightTaskQueues: string[] }

// film demand counts the renders of new films and of the backfill, each of which holds a render slot or waits for one
// in this process, because a film Worker takes a task before a slot is free
const FILM_DEMAND_GAUGE: DemandGauge = {
	name: "carlnotes_film_demand",
	help: "The film renders this replica runs or holds, plus its share of the films waiting in the film queue.",
	backlogTaskQueues: [TOPIC_VIDEO_TASK_QUEUE],
	inFlightTaskQueues: [TOPIC_VIDEO_TASK_QUEUE, TOPIC_VIDEO_BACKFILL_TASK_QUEUE],
}

// scan demand counts the ingests and reviews this replica runs, of a person's Scans and of the scheduled ones, which
// have a queue each
const SCAN_TASK_QUEUES = [SCAN_TASK_QUEUE, SCHEDULED_SCAN_TASK_QUEUE]
const SCAN_DEMAND_GAUGE: DemandGauge = {
	name: "carlnotes_scan_demand",
	help: "The scan stages this replica runs, plus its share of the scan stages waiting in the two scan queues.",
	backlogTaskQueues: SCAN_TASK_QUEUES,
	inFlightTaskQueues: SCAN_TASK_QUEUES,
}

/**
 * Returns the demand gauges a worker in a queue group serves: film demand from a film replica, scan demand from a main
 * worker, and both from a worker with no queue group.
 */
export function toDemandGauges(queueGroup: WorkerQueueGroup): DemandGauge[] {
	if (queueGroup === "films") {
		return [FILM_DEMAND_GAUGE]
	}
	return queueGroup === "main" ? [SCAN_DEMAND_GAUGE] : [SCAN_DEMAND_GAUGE, FILM_DEMAND_GAUGE]
}

/**
 * Returns one replica's demand: the activities it has in progress, plus each queue's backlog divided by that queue's
 * pollers, which is this replica's share of what waits. A queue with no poller counts its whole backlog.
 */
export function toDemand(inFlightCount: number, taskQueueDescriptions: TaskQueueDescription[]): number {
	return taskQueueDescriptions.reduce(
		(demand, { backlogCount, pollerCount }) => demand + backlogCount / Math.max(1, pollerCount),
		inFlightCount,
	)
}

// the worker's queue group, how many activities this replica has in progress on some queues, and how a queue is read
export type ReadDemandGaugesOptions = {
	queueGroup: WorkerQueueGroup
	readInFlightCount: (taskQueues: string[]) => number
	readTaskQueue?: (taskQueue: string) => Promise<TaskQueueDescription>
}

/**
 * Returns the queue group's demand gauges in Prometheus's text format. A queue that cannot be read rejects, so a
 * scrape gets no number in place of a low one.
 */
export async function readDemandGaugesText({
	queueGroup,
	readInFlightCount,
	readTaskQueue = describeTaskQueue,
}: ReadDemandGaugesOptions): Promise<string> {
	const gaugeTexts = await Promise.all(
		toDemandGauges(queueGroup).map(async ({ name, help, backlogTaskQueues, inFlightTaskQueues }) => {
			const taskQueueDescriptions = await Promise.all(backlogTaskQueues.map(readTaskQueue))
			const demand = toDemand(readInFlightCount(inFlightTaskQueues), taskQueueDescriptions)
			return `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name} ${demand}\n`
		}),
	)
	return gaugeTexts.join("")
}

/**
 * Serves the queue group's demand gauges at /metrics on WORKER_METRICS_PORT, 9464 if unset, and returns the call that
 * stops the server. Scrapes within the cache time share one read of Temporal. A scrape whose queue read fails gets a
 * 503. A port that cannot be taken is reported and the worker runs on without the gauges.
 */
export function serveDemandGauges(
	readDemandGaugesOptions: ReadDemandGaugesOptions,
	gaugesCacheMs = GAUGES_CACHE_MS,
): () => void {
	const port = toPositiveInteger(Bun.env.WORKER_METRICS_PORT, DEFAULT_METRICS_PORT)
	const readGaugesText = toCachedRead(() => readDemandGaugesText(readDemandGaugesOptions), gaugesCacheMs)
	try {
		const metricsServer = Bun.serve({ port, fetch: (request) => respondToScrape(request, readGaugesText) })
		return () => void metricsServer.stop()
	} catch (error) {
		// the port is taken or cannot be bound
		console.error(`could not serve the demand gauges on port ${port}`, error)
		reportError(error, "worker", { step: "demand-gauges" })
		return () => {}
	}
}

// a read whose result is reused for the cache time. a read that fails is never reused
function toCachedRead(read: () => Promise<string>, cacheMs: number): () => Promise<string> {
	let cachedRead: { text: Promise<string>; readAt: number } | undefined
	return () => {
		// read again once the cached read is older than the cache time
		const now = performance.now()
		if (!cachedRead || now - cachedRead.readAt >= cacheMs) {
			const text = read()
			cachedRead = { text, readAt: now }

			// a failed read leaves the cache, so the next scrape reads again
			text.catch(() => {
				cachedRead = cachedRead?.text === text ? undefined : cachedRead
			})
		}
		return cachedRead.text
	}
}

// respond to one request to the metrics server: the gauges for the scrape's path, and not found for any other
async function respondToScrape(request: Request, readGaugesText: () => Promise<string>): Promise<Response> {
	if (new URL(request.url).pathname !== METRICS_PATH) {
		return new Response("Not found", { status: 404 })
	}

	// the gauges as text, or no number at all if Temporal could not be read
	try {
		const gaugesText = await readGaugesText()
		return new Response(gaugesText, { headers: { "content-type": "text/plain; version=0.0.4" } })
	} catch (error) {
		console.error("could not read the demand gauges", error)
		return new Response("the task queue could not be read", { status: 503 })
	}
}
