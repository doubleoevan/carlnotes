// Topic Post publish activity tests: a spent budget fails the summary for good, any other failure may retry, and
// the first discussion starts through the pipeline's own start
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as models from "@carlnotes/models/models"
import * as topicPostDiscussions from "@carlnotes/pipeline/topicPosts/topicPostDiscussions"
import * as topicPostSummaries from "@carlnotes/pipeline/topicPosts/topicPostSummaries"
import { ApplicationFailure } from "@temporalio/activity"
import { startTopicPostPublishDiscussionActivity, writeTopicPostSummary } from "./publishTopicPostActivities"

// put back the module mocks after each test
afterEach(() => {
	mock.restore()
})

test("a spent budget fails the summary for good, so the workflow moves on without it", async () => {
	spyOn(topicPostSummaries, "writeStoredTopicPostSummary").mockRejectedValue(new Error("budget exceeded"))
	spyOn(models, "isBudgetRejection").mockReturnValue(true)
	const failure = await writeTopicPostSummary("post-1").catch((error: unknown) => error)
	expect(failure).toBeInstanceOf(ApplicationFailure)
	expect((failure as ApplicationFailure).nonRetryable).toBe(true)
})

test("any other failure is thrown as it is, for another attempt", async () => {
	const modelError = new Error("the model timed out")
	spyOn(topicPostSummaries, "writeStoredTopicPostSummary").mockRejectedValue(modelError)
	expect(await writeTopicPostSummary("post-1").catch((error: unknown) => error)).toBe(modelError)
})

test("the first discussion starts for the post, and a post that starts none still succeeds", async () => {
	const startSpy = spyOn(topicPostDiscussions, "startTopicPostPublishDiscussion").mockResolvedValue(null)
	await startTopicPostPublishDiscussionActivity("post-1")
	expect(startSpy).toHaveBeenCalledWith("post-1")
})
