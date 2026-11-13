// the topic post MCP view through the test host: the post with its player and its thread, a Comment's post, a
// reaction's save, and a visitor's press
import { expect, test } from "bun:test"
import { toTestOwnComment, toTestReactionSummary } from "@carlnotes/contracts/socialTestFixtures"
import {
	TOPIC_POST,
	TOPIC_POST_BODY_IMAGE_URL,
	TOPIC_POST_BODY_LINK_URL,
	toMcpViewToolResult,
	toTopicPostToolResult,
	USER_MCP_VIEW_DATA,
	VISITOR_MCP_VIEW_DATA,
} from "./mcpViewFixtures"
import { waitForRecord, withMcpView } from "./mcpViewTestHarness"
import { type OpenMcpViewOptions, TEST_SITE_URL, type ToolCallResponder } from "./mcpViewTestHost"

// the Comment the user posts, as post_hot_take returns it to the MCP view
const POSTED_COMMENT = toTestOwnComment({ id: "comment-posted", body: "The washed Ethiopian deserved better." })

// a post returns its Comment, and a reaction's save returns the post's reactions as they stand
const respondToSocialToolCall: ToolCallResponder = ({ name }) => {
	const socialMcpViewData =
		name === "post_hot_take" ? { postedComment: POSTED_COMMENT } : { reactionSummary: toTestReactionSummary() }
	return toMcpViewToolResult({ mcpViewData: { ...USER_MCP_VIEW_DATA, ...socialMcpViewData } })
}

test("the topic post MCP view shows the post with its player and its thread, and calls no tool on load", async () => {
	await withMcpView({ mcpView: "topic-post" }, async ({ frame, links, page, toolCalls, sendToolResult }) => {
		// the body image's request, which the policy lets reach the network
		const bodyImageRequest = page.waitForRequest(TOPIC_POST_BODY_IMAGE_URL)
		await sendToolResult(toTopicPostToolResult())

		// the image from the site, the title with its author and date, the summary in the info popup, and the body
		await frame.getByRole("heading", { level: 1, name: TOPIC_POST.title }).waitFor()
		await frame.locator(`img[src="${TEST_SITE_URL}${TOPIC_POST.image?.page.url}"]`).waitFor()
		await frame.getByRole("link", { name: TOPIC_POST.author.username }).first().waitFor()
		await frame.getByText("Nov 3, 2026").first().waitFor()
		await frame.getByText("bean bean bean").first().waitFor()

		// the body image loads from the site under the policy, and the TypeScript code block takes its colors
		await frame.locator('img[alt="A cupping table"]').waitFor()
		await bodyImageRequest
		await frame.locator('codeblock[data-language="typescript"][data-colored] .hljs-keyword').waitFor()
		await frame.getByRole("button", { name: "About this post" }).click()
		await frame.getByText(TOPIC_POST.summary ?? "").waitFor()

		// the popup shows the post it was given with no Share, and closes before the page under it is pressed
		await frame.getByText("Carl's Notes").waitFor()
		expect(await frame.getByRole("button", { name: /^Share/ }).count()).toBe(0)
		await frame.getByRole("button", { name: "Close" }).click()

		// a link in the body opens through the host
		await frame.getByText("the roast notes").click()
		await waitForRecord(links)
		expect(links).toEqual([TOPIC_POST_BODY_LINK_URL])

		// the thread's first page, with no control that edits, deletes, or reports
		await frame.getByText("Three of you bookmarked this one.").waitFor()
		expect(await frame.getByRole("button", { name: "Report" }).count()).toBe(0)

		// no editor, no Regenerate, and no image editing
		for (const absentControlName of ["Regenerate", "Edit post", "Edit post image"]) {
			expect(await frame.getByRole("button", { name: absentControlName }).count()).toBe(0)
		}
		expect(toolCalls).toEqual([])

		// the discussion plays the recording the tool result holds, whose url has the play token
		await frame.getByRole("button", { name: /^Play Coffee Break Discussion/ }).click()
		await frame.locator('audio[src^="data:audio/wav"]').waitFor({ state: "attached" })
		expect(toolCalls).toEqual([])
	})
})

test("a Comment posts through post_hot_take with the post as its target, and a reaction saves through its tool", async () => {
	const options: OpenMcpViewOptions = { mcpView: "topic-post", respondToToolCall: respondToSocialToolCall }
	await withMcpView(options, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toTopicPostToolResult())

		// the composer posts through the tool, and the thread shows the new Comment
		await frame.getByRole("button", { name: "Hot Take", exact: true }).click()
		await frame.getByRole("textbox").fill(POSTED_COMMENT.body)
		await frame.getByRole("button", { name: "Post", exact: true }).click()

		// the post reaches the host with the post as its target, and the new Comment shows in the thread
		await waitForRecord(toolCalls)
		await frame.getByRole("listitem").filter({ hasText: POSTED_COMMENT.body }).first().waitFor()
		expect(toolCalls).toEqual([
			{
				name: "post_hot_take",
				arguments: { target_kind: "post", target_id: TOPIC_POST.id, body: POSTED_COMMENT.body },
			},
		])

		// the post's own reaction saves through its tool, and the row shows the counts it returned
		await frame.getByRole("button", { name: "Like" }).first().click()
		await frame.getByRole("button", { name: "Like, 4" }).first().waitFor()
		expect(toolCalls[1]).toEqual({
			name: "save_reaction",
			arguments: { target_kind: "post", target_id: TOPIC_POST.id, reaction_type: "like" },
		})
	})
})

test("a visitor reads the post, and the composer opens sign-up on the site", async () => {
	await withMcpView({ mcpView: "topic-post" }, async ({ frame, links, toolCalls, sendToolResult }) => {
		await sendToolResult(toTopicPostToolResult(VISITOR_MCP_VIEW_DATA))
		await frame.getByRole("heading", { level: 1, name: TOPIC_POST.title }).waitFor()

		// the composer's button opens sign-up through the host, and no tool is called
		await frame.getByRole("button", { name: "Hot Take", exact: true }).click()
		await waitForRecord(links)
		expect(links).toEqual([`${TEST_SITE_URL}/sign-up`])
		expect(toolCalls).toEqual([])
	})
})
