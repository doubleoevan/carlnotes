// the shared reaction row, alone and on a comment, rendered through plain elements
import { afterEach, expect, test } from "bun:test"
import type { ReactionWriteResult } from "@carlnotes/client/socialClient"
import type { ReactionSummary } from "@carlnotes/contracts/social"
import { toTestComment, toTestCommentThread } from "@carlnotes/contracts/socialTestFixtures"
import type { CommentThreadProps } from "@carlnotes/core/components/CommentThread"
import type { SocialElements } from "@carlnotes/core/lib/socialElements"
import { REACTION_SAVE_ERROR } from "@carlnotes/core/lib/socialLabels"
import { act } from "react"
import { waitForHook } from "@/lib/hookTestHarness"
import {
	closeSocialTests,
	ELEMENTS,
	press,
	renderCommentThread,
	renderReactionRow,
	TARGET,
	toButtonLabels,
	toOption,
	toRows,
} from "./socialTestHarness"

// keep each test's browser environment and transport isolated
afterEach(closeSocialTests)

test("the picker shows each type's count, a press saves the type, and a second press takes it back", async () => {
	const savedSummary: ReactionSummary = {
		counts: [{ reactionType: "celebrate", count: 1, users: [] }],
		ownReactionType: "celebrate",
	}
	const { harness, save } = await renderReactionRow({ saveResult: { status: "saved", summary: savedSummary } })
	expect(toButtonLabels(harness.container)).toEqual([
		"Like 4",
		"Celebrate 0",
		"Support 0",
		"Love 0",
		"Insightful 2",
		"Funny 0",
	])

	// the press saves the type, and the picker shows the summary the save returned with the type marked
	await press(harness.container, "Celebrate")
	expect(save).toHaveBeenLastCalledWith(TARGET, "celebrate")
	expect(harness.container.querySelector('button[aria-pressed="true"]')?.textContent).toBe("Celebrate 1")

	// a press on the user's own type saves no type
	await press(harness.container, "Celebrate")
	expect(save).toHaveBeenLastCalledWith(TARGET, null)
	expect(save).toHaveBeenCalledTimes(2)
})

test("a visitor's press on a type opens sign-up and saves nothing", async () => {
	const { harness, save, signIns } = await renderReactionRow({ isSignedIn: false })
	await press(harness.container, "Like")
	expect(signIns).toHaveLength(1)
	expect(save).not.toHaveBeenCalled()
})

test("a count past the named users shows how many it leaves out", async () => {
	const user = { userId: "user-1", username: "pourover", avatarSource: null, avatarVersion: null }
	const summary: ReactionSummary = {
		counts: [{ reactionType: "like", count: 3, users: [user] }],
		ownReactionType: null,
	}
	const { harness } = await renderReactionRow({ summary })
	expect(toButtonLabels(harness.container)[0]).toBe("Like 3 and 2 more")
})

test("a press shows the type before the save returns, and a failed save puts the row back", async () => {
	const saveWrite = Promise.withResolvers<ReactionWriteResult>()
	const { harness } = await renderReactionRow({ client: { save: () => saveWrite.promise } })
	await press(harness.container, "Celebrate")
	expect(toOption(harness.container, "Celebrate").getAttribute("aria-pressed")).toBe("true")
	expect(toOption(harness.container, "Celebrate").disabled).toBe(true)
	await act(async () => saveWrite.resolve({ status: "failed", message: null }))
	expect(toOption(harness.container, "Celebrate").getAttribute("aria-pressed")).toBe("false")
	expect(toOption(harness.container, "Celebrate").disabled).toBe(false)
})

test("a save that throws an error puts the row back and says why", async () => {
	const errorMessages: string[] = []
	const { harness } = await renderReactionRow({
		client: { save: () => Promise.reject(new Error("the tool call failed")) },
		onError: (errorMessage) => errorMessages.push(errorMessage),
	})
	await press(harness.container, "Celebrate")
	expect(toOption(harness.container, "Celebrate").disabled).toBe(false)
	expect(errorMessages).toEqual([REACTION_SAVE_ERROR])
})

test("a reaction on a comment saves against that comment and updates its row alone", async () => {
	const savedSummary: ReactionSummary = {
		counts: [{ reactionType: "like", count: 1, users: [] }],
		ownReactionType: "like",
	}
	const { harness, requests } = await renderCommentThread({}, () => Response.json({ summary: savedSummary }))
	const carlRow = toRows(harness)[2] as HTMLElement
	const toLikeLabel = (row: HTMLElement): string | undefined =>
		toButtonLabels(row).find((label) => label.startsWith("Like"))
	expect(toLikeLabel(carlRow)).toBe("Like 0")
	await press(carlRow, "Like")
	await waitForHook(() => toLikeLabel(carlRow) === "Like 1")

	// the save names the comment, and the first comment keeps its own counts
	expect(requests.at(-1)).toEqual({
		method: "PUT",
		url: "https://carlnotes.test/api/reactions",
		body: { target: { kind: "comment", id: "comment-2" }, reactionType: "like" },
	})
	expect(carlRow.querySelector('button[aria-pressed="true"]')?.textContent).toBe("Like 1")
	expect(toLikeLabel(toRows(harness)[0] as HTMLElement)).toBe("Like 4")
})

test("a second press on a comment's reaction within one save sends one write", async () => {
	const saveResponse = Promise.withResolvers<Response>()
	const { harness, requests } = await renderCommentThread({}, () => saveResponse.promise)
	const carlRow = toRows(harness)[2] as HTMLElement

	// both presses land before a render can disable the option
	const likeOption = toOption(carlRow, "Like")
	await act(async () => {
		likeOption.click()
		likeOption.click()
	})
	expect(requests).toHaveLength(1)

	// the save ends, and a later press on the user's own type takes it back
	const savedSummary: ReactionSummary = {
		counts: [{ reactionType: "like", count: 1, users: [] }],
		ownReactionType: "like",
	}
	await act(async () => saveResponse.resolve(Response.json({ summary: savedSummary })))
	await waitForHook(() => toOption(carlRow, "Like").textContent === "Like 1")
	await press(carlRow, "Like")
	expect(requests.at(-1)?.body).toEqual({ target: { kind: "comment", id: "comment-2" }, reactionType: null })
})

test("a reaction on one comment renders that row alone, and so does a render of the page", async () => {
	let firstRowRenderCount = 0
	const elements: SocialElements = {
		...ELEMENTS,
		Age: () => {
			firstRowRenderCount += 1
			return null
		},
	}
	const threadProps: Partial<CommentThreadProps> = {
		elements,
		firstPage: toTestCommentThread({ comments: [toTestComment(), toTestComment({ id: "comment-2", author: null })] }),
	}
	const savedSummary: ReactionSummary = {
		counts: [{ reactionType: "like", count: 1, users: [] }],
		ownReactionType: "like",
	}
	const { harness } = await renderCommentThread(threadProps, () => Response.json({ summary: savedSummary }))
	const shownRowRenderCount = firstRowRenderCount

	// the page renders again, then the second comment takes a reaction. the second row's own age renders once more
	await harness.render()
	expect(firstRowRenderCount).toBe(shownRowRenderCount)
	const carlRow = toRows(harness)[1] as HTMLElement
	await press(carlRow, "Like")
	await waitForHook(() => toOption(carlRow, "Like").textContent === "Like 1")
	expect(firstRowRenderCount).toBe(shownRowRenderCount + 1)
})
