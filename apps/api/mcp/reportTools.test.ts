// report_content and block_user: a report past the daily limit sends nothing and says so, a report can block the
// author, blocking oneself is rejected, and a block and an unblock go through the block module
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as flagContentModule from "../report/flagContent"
import * as userBlocks from "../userBlocks"
import { BOUND_SERVER_TEXT, CONNECT_ACCOUNT_TEXT } from "./results"
import { toResultText, toToolHandler, USER, VISITOR } from "./toolTestFixtures"

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

test("a report past the daily limit sends nothing and says the limit is reached", async () => {
	spyOn(flagContentModule, "flagContent").mockResolvedValue("limitReached")
	const toolResult = await toToolHandler("report_content")({ subject_kind: "finding", subject_id: "finding-1" })
	expect(toolResult.isError).toBe(true)
	expect(toResultText(toolResult)).toBe("This account has sent enough reports for one day. Nothing was reported.")
})

test("a report of an Open Mic post's image can block its author", async () => {
	const flagContent = spyOn(flagContentModule, "flagContent").mockResolvedValue("sent")
	const toolResult = await toToolHandler("report_content")({
		subject_kind: "topicPostImage",
		subject_id: "post-1",
		reason: "spam",
		should_block_author: true,
	})
	expect(toResultText(toolResult)).toBe("Reported. An admin reviews the report.")
	expect(flagContent.mock.calls[0]?.[0]).toMatchObject({
		userId: "user-1",
		payload: { subjectKind: "topicPostImage", subjectId: "post-1", reason: "spam", shouldBlockAuthor: true },
	})
})

test("blocking oneself is rejected, and a block and an unblock go through", async () => {
	// the block module rejects oneself before any read
	const selfResult = await toToolHandler("block_user")({ user_id: "user-1", is_blocked: true })
	expect(selfResult.isError).toBe(true)
	expect(toResultText(selfResult)).toBe("A person cannot block themselves. Nothing was blocked.")

	// a block of another person, then the unblock
	const saveUserBlock = spyOn(userBlocks, "saveUserBlock").mockResolvedValue("saved")
	const deleteUserBlock = spyOn(userBlocks, "deleteUserBlock").mockResolvedValue()
	expect(toResultText(await toToolHandler("block_user")({ user_id: "user-2", is_blocked: true }))).toBe("Blocked.")
	expect(saveUserBlock).toHaveBeenCalledWith("user-1", "user-2")
	expect(toResultText(await toToolHandler("block_user")({ user_id: "user-2", is_blocked: false }))).toBe("Unblocked.")
	expect(deleteUserBlock).toHaveBeenCalledWith("user-1", "user-2")
})

test("a visitor and a bound server report and block nothing", async () => {
	// a report asks a visitor to connect, and the bound server rejects it
	const flagContent = spyOn(flagContentModule, "flagContent")
	const reportArguments = { subject_kind: "finding", subject_id: "finding-1" }
	expect(toResultText(await toToolHandler("report_content", VISITOR)(reportArguments))).toBe(CONNECT_ACCOUNT_TEXT)
	expect(toResultText(await toToolHandler("report_content", USER, "topic-1")(reportArguments))).toBe(BOUND_SERVER_TEXT)

	// the bound server rejects a block too, and no report went out
	const blockArguments = { user_id: "user-2", is_blocked: true }
	expect(toResultText(await toToolHandler("block_user", USER, "topic-1")(blockArguments))).toBe(BOUND_SERVER_TEXT)
	expect(flagContent).not.toHaveBeenCalled()
})
