// the heartbeat that a long activity step runs under: the film's render and rebuild, a podcast episode's encode, a
// Topic Post Discussion's recording, a topic memory update, and a Scan's ingest and review

import { HEARTBEAT_INTERVAL_MS } from "@carlnotes/pipeline/stageTimeouts"
import { asyncLocalStorage } from "@temporalio/activity"

// what each heartbeat also does: the step's own check, and the details the heartbeat sends
type HeartbeatOptions = {
	checkOnHeartbeat?: () => Promise<void>
	toHeartbeatDetails?: () => unknown
}

/**
 * Runs an activity's step with the attempt's cancellation signal, heartbeating every 30 seconds until the step ends, so
 * Temporal can tell a step that is alive from one whose worker was killed. Each heartbeat sends the details that
 * toHeartbeatDetails returns, if given, and runs the step's own check, if it has one. A check that fails is tried again
 * at the next heartbeat. Outside an activity, as in a smoke, the step runs with no heartbeat and a signal that never
 * aborts.
 */
export async function runWithHeartbeat<StepResult>(
	runStep: (signal: AbortSignal) => Promise<StepResult>,
	{ checkOnHeartbeat, toHeartbeatDetails }: HeartbeatOptions = {},
): Promise<StepResult> {
	// heartbeat while the step runs, however long one ffmpeg run takes
	const activityContext = asyncLocalStorage.getStore()
	const heartbeatInterval = setInterval(() => {
		activityContext?.heartbeat(toHeartbeatDetails?.())
		checkOnHeartbeat?.().catch(() => undefined)
	}, HEARTBEAT_INTERVAL_MS)

	// run the step, and stop the heartbeats once it ends or fails
	try {
		return await runStep(activityContext?.cancellationSignal ?? new AbortController().signal)
	} finally {
		clearInterval(heartbeatInterval)
	}
}
