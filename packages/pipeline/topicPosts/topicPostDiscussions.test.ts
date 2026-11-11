// Topic Post Discussion recording tests: the first discussion's start, a start whose workflow fails, the screen of the
// Comments and the author's name, a spent budget, and a post that is gone
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as monthlyBudgetCutoffs from "@carlnotes/db/monthlyBudgetCutoffs"
import * as sharedComments from "@carlnotes/db/sharedComments"
import * as litellm from "@carlnotes/models/litellm"
import type { ModerationClassification } from "@carlnotes/models/moderation"
import * as moderation from "@carlnotes/models/moderation"
import * as temporalClient from "../temporalClient"
import * as discussionScript from "./topicPostDiscussionScript"
import {
	startTopicPostDiscussion,
	startTopicPostPublishDiscussion,
	TopicPostDiscussionError,
	writeTopicPostDiscussionScript,
} from "./topicPostDiscussions"

// put back the connection pool and the module mocks after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// a recording row joined to its published post and its author's name, in the script read's column order
const DISCUSSION_ROW = [
	"member-2",
	"recording",
	null,
	"post-1",
	"Light Roasts",
	"<p>Start light.</p>",
	new Date(),
	"Rude-Name",
]

// the two turns a written script holds
const TURNS = [
	{ speaker: "host" as const, text: "Start light, she says." },
	{ speaker: "cohost" as const, text: "And she is right." },
]

// a classification that flags a text, and one that lets it through
const toClassification = (isViolation: boolean): ModerationClassification =>
	({ outcome: "classified", verdict: { isViolation, category: isViolation ? "harassment" : null } }) as never

// the recording row's read, the starter's key, a month with budget left, and a script the writer returns
function stubScriptWrite(): { sentQueries: ReturnType<typeof stubConnectionPool>; writeSpy: ReturnType<typeof spyOn> } {
	const sentQueries = stubConnectionPool(({ text }) => (text.startsWith("select") ? [DISCUSSION_ROW] : []))
	spyOn(litellm, "loadOrProvisionUserLiteLLMKey").mockResolvedValue("member-2-key")
	spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(false)
	const writeSpy = spyOn(discussionScript, "writeTopicPostDiscussion").mockResolvedValue({
		turns: TURNS,
		costDollars: 0.02,
	})
	return { sentQueries, writeSpy }
}

test("a flagged Comment is left out, a flagged author is not named, and the script bills the starter's key", async () => {
	const { sentQueries, writeSpy } = stubScriptWrite()
	spyOn(sharedComments, "loadTopicPostSharedCommentTexts").mockResolvedValue([
		{ username: "Clover-Field", body: "A full meter lost half my foragers." },
		{ username: "Loud-Hornet", body: "a flagged thing to say" },
	])

	// the screen flags one Comment's text and the author's username
	spyOn(moderation, "classifyUserText").mockImplementation(async ({ text }) =>
		toClassification(text === "a flagged thing to say" || text === "Rude-Name"),
	)
	await writeTopicPostDiscussionScript("discussion-1", "the pancake part")

	// the writer reads the clean Comment alone, with no author to name, on the key of the user the row bills
	expect(writeSpy).toHaveBeenCalledWith({
		title: "Light Roasts",
		html: "<p>Start light.</p>",
		authorUsername: null,
		comments: [{ username: "Clover-Field", body: "A full meter lost half my foragers." }],
		hint: "the pancake part",
		litellmApiKey: "member-2-key",
	})

	// the script is kept on the row, and the note is in no query
	const updateQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "topic_post_discussions"'))
	expect(JSON.stringify(updateQuery?.values)).toContain("Start light, she says.")
	expect(JSON.stringify(sentQueries)).not.toContain("the pancake part")
})

test("a spent budget fails the discussion alone, before any model call", async () => {
	const { writeSpy } = stubScriptWrite()
	spyOn(monthlyBudgetCutoffs, "isMonthlyBudgetCutoffPassed").mockResolvedValue(true)
	const failure = await writeTopicPostDiscussionScript("discussion-1").catch((error: unknown) => error)
	expect(failure).toBeInstanceOf(TopicPostDiscussionError)
	expect((failure as TopicPostDiscussionError).isBudgetSpent).toBe(true)
	expect(writeSpy).not.toHaveBeenCalled()
})

test("a discussion whose post was deleted has nothing to record", async () => {
	const { writeSpy } = stubScriptWrite()

	// the delete took the recording row with the post
	stubConnectionPool()
	const failure = await writeTopicPostDiscussionScript("discussion-1").catch((error: unknown) => error)
	expect(failure).toBeInstanceOf(TopicPostDiscussionError)
	expect((failure as TopicPostDiscussionError).isBudgetSpent).toBe(false)
	expect(writeSpy).not.toHaveBeenCalled()
})

test("a published post's first discussion bills its author, and starts once", async () => {
	const startWorkflowSpy = spyOn(temporalClient, "startTopicPostDiscussionWorkflow").mockResolvedValue()

	// the post's author, no discussion yet, and the row the insert returns
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.startsWith("insert")) {
			return [["discussion-1"]]
		}
		return text.includes('from "topic_posts"') ? [["author-1"]] : []
	})
	// the discussion starts, billed to the author
	expect(await startTopicPostPublishDiscussion("post-1")).toBe("discussion-1")
	const insertQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith("insert"))
	expect(insertQuery?.values).toEqual(expect.arrayContaining(["post-1", "author-1", "publish"]))
	expect(startWorkflowSpy).toHaveBeenCalledWith({ discussionId: "discussion-1", hint: undefined })

	// a post that already has a discussion, and a post that is gone, start none
	stubConnectionPool(({ text }) => (text.includes('from "topic_posts"') ? [["author-1"]] : [["discussion-1"]]))
	expect(await startTopicPostPublishDiscussion("post-1")).toBeNull()
	stubConnectionPool()
	expect(await startTopicPostPublishDiscussion("post-1")).toBeNull()
	expect(startWorkflowSpy).toHaveBeenCalledTimes(1)
})

test("a discussion whose workflow does not start leaves no recording row, so the next start is not blocked", async () => {
	// the insert returns the row, and the workflow's start fails
	const workflowError = new Error("temporal is down")
	const startWorkflowSpy = spyOn(temporalClient, "startTopicPostDiscussionWorkflow").mockRejectedValue(workflowError)
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.startsWith("insert")) {
			return [["discussion-1"]]
		}
		return text.includes('from "topic_posts"') ? [["author-1"]] : []
	})

	// the start throws the workflow's error, after the row is deleted
	const failure = await startTopicPostDiscussion({ topicPostId: "post-1", userId: "member-2", kind: "regenerate" })
		.then(() => null)
		.catch((error: unknown) => error)
	expect(failure).toBe(workflowError)
	const deleteQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('delete from "topic_post_discussions"'))
	expect(deleteQuery?.values).toEqual(["discussion-1"])

	// the publish's next attempt finds no discussion, and starts one
	startWorkflowSpy.mockResolvedValue()
	expect(await startTopicPostPublishDiscussion("post-1")).toBe("discussion-1")
	expect(startWorkflowSpy).toHaveBeenCalledTimes(2)
})
