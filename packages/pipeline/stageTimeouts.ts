// how long each stage of a Scan, a podcast episode's recording, a film's render, a Topic Post Discussion's recording,
// a topic image render, and an attachment's processing may run before Temporal gives up on it, and the longest each
// can run, which the reaper's limits are derived from. the workflows and the sweep both import this module, so each
// number has one copy. it holds no Bun or process read and no server import, because Temporal bundles
// workflow code for its sandbox
import { DAY_MS, HOUR_MS, MINUTE_MS } from "@carlnotes/contracts/time"

// review is the long one, fetching and scoring every Resource that cleared the gate
export const INGEST_TIMEOUT_MS = 30 * MINUTE_MS
export const REVIEW_TIMEOUT_MS = 30 * MINUTE_MS
export const FINISH_TIMEOUT_MS = 2 * MINUTE_MS

// how long into a review attempt a model call may still wait to try again. the rest of the review timeout is left
// for the calls in progress, the scan report, and the closing writes
export const REVIEW_MODEL_CALL_WAIT_DEADLINE_MS = 20 * MINUTE_MS

// how many times each stage may be attempted. the review's two retries cover two worker shutdowns close together, as
// two deploys are
export const INGEST_ATTEMPTS = 3
export const REVIEW_ATTEMPTS = 3
export const FINISH_ATTEMPTS = 3

// the longest the closing writes run across all of their attempts, once a closing Worker picks them up
const FINISH_TOTAL_TIMEOUT_MS = FINISH_TIMEOUT_MS * FINISH_ATTEMPTS

// how long a stage that waits for a shared worker slot may wait and run across every attempt: a Scan's ingest and
// review, and a Source's screen. Temporal counts each wait against this bound
export const QUEUED_STAGE_TIMEOUT_MS = DAY_MS

// how often a long stage reports that its worker is alive, and how long the server waits before calling it dead
export const HEARTBEAT_INTERVAL_MS = 30 * 1000
export const HEARTBEAT_TIMEOUT_MS = 2 * MINUTE_MS

// the longest a picked-up Scan may run, its ingest and review each waiting and running up to the queued stage bound,
// then the closing writes. it is what has to pass before the Scan is marked failed
export const MAX_SCAN_DURATION_MS = 2 * QUEUED_STAGE_TIMEOUT_MS + FINISH_TOTAL_TIMEOUT_MS

// how long past its workflow's longest run a row may stay in progress before the reaper acts on it
export const REAPER_MARGIN_MS = 15 * MINUTE_MS

// how many times a url Source's screen may be attempted, and the failure type that names an attempt the next one may
// pass: a rate limit, a server error, a timeout, or a dropped connection
export const SCREEN_ATTEMPTS = 3
export const RETRYABLE_SCREEN_FAILURE_TYPE = "TransientScreenFailure"

// Temporal's default retry policy: the first retry waits a second, and each wait after it doubles
const DEFAULT_RETRY_INITIAL_INTERVAL_MS = 1000
const DEFAULT_RETRY_BACKOFF_COEFFICIENT = 2

// a retry policy as Temporal's activity options take it: how many attempts the activity gets, the first wait, the
// coefficient each wait grows by, and the longest wait. the waits default to Temporal's own
type ActivityRetryPolicy = {
	maximumAttempts: number
	initialInterval?: number
	backoffCoefficient?: number
	maximumInterval?: number
}

/**
 * Returns the longest an activity can run once a worker picks it up: every attempt at its timeout, with the wait that
 * its retry policy sets before each retry. A wait for a worker slot is not counted.
 */
export function toLongestActivityRunMs(
	timeoutMs: number,
	{
		maximumAttempts,
		initialInterval = DEFAULT_RETRY_INITIAL_INTERVAL_MS,
		backoffCoefficient = DEFAULT_RETRY_BACKOFF_COEFFICIENT,
		maximumInterval = Number.POSITIVE_INFINITY,
	}: ActivityRetryPolicy,
): number {
	// add the wait before each retry, which grows by the coefficient up to the policy's longest wait
	let retryWaitMs = 0
	for (let retry = 0; retry < maximumAttempts - 1; retry++) {
		retryWaitMs += Math.min(initialInterval * backoffCoefficient ** retry, maximumInterval)
	}
	return timeoutMs * maximumAttempts + retryWaitMs
}

// a recording's plan, saved script, publish, and failure are short writes
export const PODCAST_WRITE_TIMEOUT_MS = 2 * MINUTE_MS
export const PODCAST_WRITE_ATTEMPTS = 3

// one attempt of a script activity has time to write up to three drafts. the activity is tried again, backing off as
// a chapter does, until an hour after it was scheduled, so a model's rate limit delays a podcast episode and never
// fails it
export const PODCAST_SCRIPT_TIMEOUT_MS = 10 * MINUTE_MS
export const PODCAST_SCRIPT_TOTAL_TIMEOUT_MS = HOUR_MS

// the podcast episode image's scene and render get three minutes an attempt, backing off from 15 seconds over three
// attempts
export const PODCAST_IMAGE_TIMEOUT_MS = 3 * MINUTE_MS
export const PODCAST_IMAGE_RETRY_POLICY = { initialInterval: 15 * 1000, backoffCoefficient: 2, maximumAttempts: 3 }

// a chapter's and a script activity's retries back off from 30 seconds, doubling up to 15 minutes apart
export const PODCAST_CHAPTER_RETRY_POLICY = {
	initialInterval: 30 * 1000,
	backoffCoefficient: 2,
	maximumInterval: 15 * MINUTE_MS,
}

// a standard chapter's attempt gets a minute more than the speech call's three-minute timeout, and the chapter is
// tried again until an hour after it was scheduled
export const STANDARD_CHAPTER_TIMEOUT_MS = 4 * MINUTE_MS
export const STANDARD_CHAPTER_TOTAL_TIMEOUT_MS = HOUR_MS

// a flex chapter's attempt gets a minute more than the speech call's twelve-minute timeout. a flex chapter waits for
// capacity for up to six hours, a bound that counts its wait for a slot too
export const FLEX_CHAPTER_TIMEOUT_MS = 13 * MINUTE_MS
export const FLEX_CHAPTER_TOTAL_TIMEOUT_MS = 6 * HOUR_MS

// the encode reads and writes a whole podcast episode's audio, and gets three attempts
export const PODCAST_ENCODE_TIMEOUT_MS = 10 * MINUTE_MS
export const PODCAST_ENCODE_ATTEMPTS = 3

// the longest a short write runs across its attempts
const PODCAST_WRITE_TOTAL_MS = toLongestActivityRunMs(PODCAST_WRITE_TIMEOUT_MS, {
	maximumAttempts: PODCAST_WRITE_ATTEMPTS,
})

// the longest the chapters record: every chapter is scheduled at once, so the slower tier's one chapter sets it
const PODCAST_CHAPTERS_TOTAL_MS = Math.max(FLEX_CHAPTER_TOTAL_TIMEOUT_MS, STANDARD_CHAPTER_TOTAL_TIMEOUT_MS)

// the longest the encode runs across its attempts
const PODCAST_ENCODE_TOTAL_MS = toLongestActivityRunMs(PODCAST_ENCODE_TIMEOUT_MS, {
	maximumAttempts: PODCAST_ENCODE_ATTEMPTS,
})

// the longest the script takes: the plan, the outline, the segments, which run together, and the saved script
const PODCAST_SCRIPT_STAGES_TOTAL_MS = 2 * PODCAST_WRITE_TOTAL_MS + 2 * PODCAST_SCRIPT_TOTAL_TIMEOUT_MS

// the longest the row stays recording once its audio is encoded: a publish that fails every attempt, then the failure
// write
const PODCAST_CLOSING_TOTAL_MS = 2 * PODCAST_WRITE_TOTAL_MS

// the longest a recording can run while its row still reads recording, with a slot granted at once to every activity:
// the script, the chapters, the encode, and the closing writes. it is a sum of run times and no bound, because a
// short write and the encode do not count their wait for a slot, so the reaper asks Temporal before it acts on a row
// past it
export const MAX_PODCAST_EPISODE_RECORDING_MS =
	PODCAST_SCRIPT_STAGES_TOTAL_MS + PODCAST_CHAPTERS_TOTAL_MS + PODCAST_ENCODE_TOTAL_MS + PODCAST_CLOSING_TOTAL_MS

// a film's render gets four hours an attempt and three attempts. it heartbeats every 30 seconds, so one with no
// heartbeat for the heartbeat timeout is on a replica that was killed, and its next attempt starts then. a worker with
// one core renders a film in about three times the film's length
export const TOPIC_VIDEO_RENDER_TIMEOUT_MS = 4 * HOUR_MS
export const TOPIC_VIDEO_RENDER_ATTEMPTS = 3

// a film's row written at queue time and its failure mark are short writes
export const TOPIC_VIDEO_WRITE_TIMEOUT_MS = 2 * MINUTE_MS
export const TOPIC_VIDEO_WRITE_ATTEMPTS = 3

// the longest a film's render can run while its row still reads rendering, with the film slot granted at once: every
// attempt of the render, then the failure mark
export const MAX_TOPIC_VIDEO_RENDER_MS =
	toLongestActivityRunMs(TOPIC_VIDEO_RENDER_TIMEOUT_MS, { maximumAttempts: TOPIC_VIDEO_RENDER_ATTEMPTS }) +
	toLongestActivityRunMs(TOPIC_VIDEO_WRITE_TIMEOUT_MS, { maximumAttempts: TOPIC_VIDEO_WRITE_ATTEMPTS })

// a Topic Post Discussion's script is up to three drafts of one model call each
export const DISCUSSION_SCRIPT_TIMEOUT_MS = 5 * MINUTE_MS
export const DISCUSSION_SCRIPT_ATTEMPTS = 2

// a discussion's recording is one speech call, an ffmpeg pass, and an upload. its retries back off from 30 seconds
export const DISCUSSION_RECORDING_TIMEOUT_MS = 10 * MINUTE_MS
export const DISCUSSION_RECORDING_RETRY_POLICY = {
	initialInterval: 30 * 1000,
	backoffCoefficient: 2,
	maximumInterval: 5 * MINUTE_MS,
	maximumAttempts: 3,
}

// the failure write of a discussion and of a topic image render is short and idempotent
export const SHORT_WRITE_TIMEOUT_MS = MINUTE_MS
export const SHORT_WRITE_ATTEMPTS = 3
const SHORT_WRITE_TOTAL_MS = toLongestActivityRunMs(SHORT_WRITE_TIMEOUT_MS, { maximumAttempts: SHORT_WRITE_ATTEMPTS })

// the longest a discussion can run while its row still reads recording: the script, the recording, and the failure
// write
export const MAX_TOPIC_POST_DISCUSSION_RECORDING_MS =
	toLongestActivityRunMs(DISCUSSION_SCRIPT_TIMEOUT_MS, { maximumAttempts: DISCUSSION_SCRIPT_ATTEMPTS }) +
	toLongestActivityRunMs(DISCUSSION_RECORDING_TIMEOUT_MS, DISCUSSION_RECORDING_RETRY_POLICY) +
	SHORT_WRITE_TOTAL_MS

// a topic image's scene is one short text call with three attempts
export const TOPIC_IMAGE_SCENE_TIMEOUT_MS = 2 * MINUTE_MS
export const TOPIC_IMAGE_SCENE_ATTEMPTS = 3

// a topic image's render retries back off from 15 seconds, doubling up to five minutes apart, over five attempts
export const TOPIC_IMAGE_RENDER_TIMEOUT_MS = 3 * MINUTE_MS
export const TOPIC_IMAGE_RENDER_RETRY_POLICY = {
	initialInterval: 15 * 1000,
	backoffCoefficient: 2,
	maximumInterval: 5 * MINUTE_MS,
	maximumAttempts: 5,
}

// the longest a topic image render can run while its row still reads pending: the scene, the render, and the failure
// write
export const MAX_TOPIC_IMAGE_RENDER_MS =
	toLongestActivityRunMs(TOPIC_IMAGE_SCENE_TIMEOUT_MS, { maximumAttempts: TOPIC_IMAGE_SCENE_ATTEMPTS }) +
	toLongestActivityRunMs(TOPIC_IMAGE_RENDER_TIMEOUT_MS, TOPIC_IMAGE_RENDER_RETRY_POLICY) +
	SHORT_WRITE_TOTAL_MS

// each step of an attachment's processing gets five minutes an attempt for extraction and the model calls. its retries
// wait 15 and then 30 seconds, so a busy model has time to free up
export const ATTACHMENT_STEP_TIMEOUT_MS = 5 * MINUTE_MS
export const ATTACHMENT_STEP_RETRY_POLICY = { initialInterval: 15 * 1000, backoffCoefficient: 2, maximumAttempts: 3 }

// the steps an attachment's processing runs one after another while its row still reads pending: the extraction, the
// chunk summaries, which run together, the closing write, and the failure write
const ATTACHMENT_STEP_COUNT = 4

// the longest an attachment's processing can run while its row still reads pending
export const MAX_ATTACHMENT_PROCESSING_MS =
	ATTACHMENT_STEP_COUNT * toLongestActivityRunMs(ATTACHMENT_STEP_TIMEOUT_MS, ATTACHMENT_STEP_RETRY_POLICY)
