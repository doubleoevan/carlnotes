// Topic Post publish workflow tests: the steps in order with the wait before the last summary and the discussion, each
// step best effort, and an edit's summary after its quiet wait
import { beforeEach, expect, mock, test } from "bun:test"
import { SOCIAL_EDIT_MS } from "@carlnotes/contracts/social"

// what the workflow did, in order, the steps a test makes fail, the version the summary activity returns, and whether
// the workflow runs on the patched code
let steps: string[] = []
let failingSteps: string[] = []
let storedVersion = 3
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

// the summary activity, which records the version it was told to skip and returns the stored one
async function writeTopicPostSummary(topicPostId: string, summarizedVersion?: number | null): Promise<number> {
	await toActivity(summarizedVersion === undefined ? "summary" : `summary-after-${summarizedVersion}`)(topicPostId)
	return storedVersion
}

// the sandbox's activities, timer, and patch marker, replaced before the workflow module loads
mock.module("@temporalio/workflow", () => ({
	proxyActivities: () => ({
		writeTopicPostSummary,
		startTopicPostImageRender: toActivity("image"),
		startTopicPostPublishDiscussionActivity: toActivity("discussion"),
	}),
	sleep: async (milliseconds: number): Promise<void> => {
		steps.push(`sleep:${milliseconds}`)
	},
	patched: () => isPatched,
}))
const { publishTopicPostWorkflow, summarizeTopicPostWorkflow } = await import("./publishTopicPost")

// start each test with no step taken, none failing, the post at its third version, and the patched code
beforeEach(() => {
	steps = []
	failingSteps = []
	storedVersion = 3
	isPatched = true
})

test("a publish writes the summary at once, starts the image, waits out the edit time, then writes a last summary against the first one's version and starts the discussion", async () => {
	await publishTopicPostWorkflow({ topicPostId: "post-1" })
	expect(steps).toEqual([
		"summary:post-1",
		"image:post-1",
		`sleep:${SOCIAL_EDIT_MS}`,
		"summary-after-3:post-1",
		"discussion:post-1",
	])
})

test("each step is best effort, so a failed step stops none of the steps after it, and a failed first summary is written again whole", async () => {
	failingSteps = ["summary", "image", "summary-after-null", "discussion"]
	await publishTopicPostWorkflow({ topicPostId: "post-1" })
	expect(steps).toEqual([
		"summary:post-1",
		"image:post-1",
		`sleep:${SOCIAL_EDIT_MS}`,
		"summary-after-null:post-1",
		"discussion:post-1",
	])
})

test("a publish replaying from before the last summary's patch writes none", async () => {
	isPatched = false
	await publishTopicPostWorkflow({ topicPostId: "post-1" })
	expect(steps).toEqual(["summary:post-1", "image:post-1", `sleep:${SOCIAL_EDIT_MS}`, "discussion:post-1"])
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
