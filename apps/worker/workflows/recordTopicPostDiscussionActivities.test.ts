// Topic Post Discussion activity tests: which failures are final and which another attempt may fix, and the
// recording's heartbeat and cancellation signal
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as models from "@carlnotes/models/models"
import { SpeechFailedError } from "@carlnotes/pipeline/podcast/podcastEpisodeAudio"
import { RejectedScriptError } from "@carlnotes/pipeline/podcast/podcastEpisodeScript"
import * as topicPostDiscussionAudio from "@carlnotes/pipeline/topicPosts/topicPostDiscussionAudio"
import * as topicPostDiscussions from "@carlnotes/pipeline/topicPosts/topicPostDiscussions"
import { ApplicationFailure } from "@temporalio/activity"
import { MockActivityEnvironment } from "@temporalio/testing"
import { DefaultLogger } from "@temporalio/worker"
import {
	recordTopicPostDiscussionAudioActivity,
	writeTopicPostDiscussionScriptActivity,
} from "./recordTopicPostDiscussionActivities"

// put back the module mocks after each test
afterEach(() => {
	mock.restore()
})

// the failure the script activity throws for one error of the script's write
async function toScriptFailure(error: Error): Promise<unknown> {
	spyOn(topicPostDiscussions, "writeTopicPostDiscussionScript").mockRejectedValue(error)
	return writeTopicPostDiscussionScriptActivity({ discussionId: "discussion-1" }).catch((failure: unknown) => failure)
}

test("a spent budget, a post that is gone, and a script no draft got right are final", async () => {
	// the cutoff's own error, and the proxy's rejection
	const cutoffFailure = await toScriptFailure(new topicPostDiscussions.TopicPostDiscussionError("spent", true))
	expect(cutoffFailure).toMatchObject({ nonRetryable: true, type: "BudgetSpent" })
	spyOn(models, "isBudgetRejection").mockReturnValue(true)
	expect(await toScriptFailure(new Error("budget exceeded"))).toMatchObject({ nonRetryable: true, type: "BudgetSpent" })
	mock.restore()

	// a deleted post, and a rejected last draft
	const goneFailure = await toScriptFailure(new topicPostDiscussions.TopicPostDiscussionError("no published post"))
	expect(goneFailure).toMatchObject({ nonRetryable: true, type: "DiscussionNotRecordable" })
	const rejectedFailure = await toScriptFailure(new RejectedScriptError("only one host speaks"))
	expect(rejectedFailure).toMatchObject({ nonRetryable: true, type: "RejectedScript" })
})

test("a model error is thrown as it is, and the note reaches the script's write", async () => {
	const modelError = new Error("the model timed out")
	expect(await toScriptFailure(modelError)).toBe(modelError)

	// the starter's note goes to the write with the discussion's id
	const writeSpy = spyOn(topicPostDiscussions, "writeTopicPostDiscussionScript").mockResolvedValue()
	await writeTopicPostDiscussionScriptActivity({ discussionId: "discussion-1", hint: "the pancake part" })
	expect(writeSpy).toHaveBeenCalledWith("discussion-1", "the pancake part")
})

// run the recording's activity in a mock activity context, and return what it threw. the environment logs errors
// alone, so a failed attempt's warning stays out of the test output
function runRecordingActivity(
	activityEnvironment = new MockActivityEnvironment({}, { logger: new DefaultLogger("ERROR") }),
): Promise<unknown> {
	return activityEnvironment.run(recordTopicPostDiscussionAudioActivity, "discussion-1").then(
		() => undefined,
		(error: unknown) => error,
	)
}

test("a speech failure retries only if another attempt can help", async () => {
	const recordSpy = spyOn(topicPostDiscussionAudio, "recordTopicPostDiscussionAudio")

	// a failure the speech model may not repeat
	recordSpy.mockRejectedValue(new SpeechFailedError("no audio came back", true))
	const retryableFailure = await runRecordingActivity()
	expect(retryableFailure).toBeInstanceOf(ApplicationFailure)
	expect(retryableFailure).toMatchObject({ nonRetryable: false, type: "SpeechFailed" })

	// a failure every attempt would repeat
	recordSpy.mockRejectedValue(new SpeechFailedError("the script was refused", false))
	const finalFailure = await runRecordingActivity()
	expect(finalFailure).toMatchObject({ nonRetryable: true, type: "SpeechFailed" })
})

// a recording whose worker was killed must be tried again after two minutes, not after its ten-minute timeout
test("the recording heartbeats while it runs, and gets the signal that a cancelled attempt aborts", async () => {
	// a recording that lets one heartbeat interval pass, and keeps the signal it was given
	let fireHeartbeat = (): void => {}
	spyOn(globalThis, "setInterval").mockImplementation(((onInterval: () => void) => {
		fireHeartbeat = onInterval
		return 7
	}) as unknown as typeof setInterval)

	// the stubbed recording fires the captured heartbeat once
	const recordingSignals: (AbortSignal | undefined)[] = []
	spyOn(topicPostDiscussionAudio, "recordTopicPostDiscussionAudio").mockImplementation(
		async (_discussionId, signal) => {
			recordingSignals.push(signal)
			fireHeartbeat()
		},
	)

	// one heartbeat reached Temporal, and cancelling the attempt aborts the recording's signal
	const activityEnvironment = new MockActivityEnvironment()
	let heartbeatCount = 0
	activityEnvironment.on("heartbeat", () => {
		heartbeatCount += 1
	})
	await runRecordingActivity(activityEnvironment)
	expect(heartbeatCount).toBe(1)
	// a cancel reaches the recording
	activityEnvironment.cancel()
	expect(recordingSignals[0]?.aborted).toBe(true)
})
