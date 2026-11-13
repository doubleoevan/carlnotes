// Topic Post publish workflow tests: the steps in order with the wait before the discussion, each step best effort,
// and an edit's summary after its quiet wait
import { beforeEach, expect, mock, test } from "bun:test"
import { TOPIC_POST_DISCUSSION_WAIT_MS } from "@carlnotes/contracts/topicPosts"

// what the workflow did, in order, the steps a test makes fail, and whether the workflow runs on the patched code
let steps: string[] = []
let failingSteps: string[] = []
let isPatched = true

// one activity that records its call, and fails if a test says so
const toActivity =
	(step: string) =>
	async (topicPostId: string): Promise<void> => {
		steps.push(`${step}:${topicPostId}`)
		if (failingSteps.includes(step)) {
			throw new Error(`${step} failed`)
		}
	}

// the sandbox's activities, timer, and patch marker, replaced before the workflow module loads
mock.module("@temporalio/workflow", () => ({
	proxyActivities: () => ({
		writeTopicPostSummary: toActivity("summary"),
		startTopicPostImageRender: toActivity("image"),
		startTopicPostPublishDiscussionActivity: toActivity("discussion"),
	}),
	sleep: async (milliseconds: number): Promise<void> => {
		steps.push(`sleep:${milliseconds}`)
	},
	patched: () => isPatched,
}))
const { publishTopicPostWorkflow, summarizeTopicPostWorkflow } = await import("./publishTopicPost")

// start each test with no step taken, none failing, and the patched code
beforeEach(() => {
	steps = []
	failingSteps = []
	isPatched = true
})

test("a publish writes the summary at once, starts the image, then waits 15 minutes and starts the discussion", async () => {
	await publishTopicPostWorkflow({ topicPostId: "post-1" })
	expect(steps).toEqual([
		"summary:post-1",
		"image:post-1",
		`sleep:${TOPIC_POST_DISCUSSION_WAIT_MS}`,
		"discussion:post-1",
	])
})

test("each step is best effort, so a failed step stops none of the steps after it", async () => {
	failingSteps = ["summary", "image", "discussion"]
	await publishTopicPostWorkflow({ topicPostId: "post-1" })
	expect(steps).toEqual([
		"summary:post-1",
		"image:post-1",
		`sleep:${TOPIC_POST_DISCUSSION_WAIT_MS}`,
		"discussion:post-1",
	])
})

test("an edit's summary rewrite waits thirty seconds, then is the summary alone, and its failure keeps the summary the post had", async () => {
	failingSteps = ["summary"]
	await summarizeTopicPostWorkflow({ topicPostId: "post-1" })
	expect(steps).toEqual(["sleep:30000", "summary:post-1"])

	// a rewrite replaying from before the wait's patch summarizes at once
	steps = []
	isPatched = false
	await summarizeTopicPostWorkflow({ topicPostId: "post-1" })
	expect(steps).toEqual(["summary:post-1"])
})
