// Topic Post Discussion activity tests: which failures are final and which another attempt may fix
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as models from "@carlnotes/models/models"
import { SpeechFailedError } from "@carlnotes/pipeline/podcast/podcastEpisodeAudio"
import { RejectedScriptError } from "@carlnotes/pipeline/podcast/podcastEpisodeScript"
import * as topicPostDiscussions from "@carlnotes/pipeline/topicPosts/topicPostDiscussions"
import { ApplicationFailure } from "@temporalio/activity"
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

test("a speech failure retries only if another attempt can help", async () => {
	const recordSpy = spyOn(topicPostDiscussions, "recordTopicPostDiscussionAudio")

	// a failure the speech model may not repeat
	recordSpy.mockRejectedValue(new SpeechFailedError("no audio came back", true))
	const retryableFailure = await recordTopicPostDiscussionAudioActivity("discussion-1").catch((error: unknown) => error)
	expect(retryableFailure).toBeInstanceOf(ApplicationFailure)
	expect(retryableFailure).toMatchObject({ nonRetryable: false, type: "SpeechFailed" })

	// a failure every attempt would repeat
	recordSpy.mockRejectedValue(new SpeechFailedError("the script was refused", false))
	const finalFailure = await recordTopicPostDiscussionAudioActivity("discussion-1").catch((error: unknown) => error)
	expect(finalFailure).toMatchObject({ nonRetryable: true, type: "SpeechFailed" })
})
