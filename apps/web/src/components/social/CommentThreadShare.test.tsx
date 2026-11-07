// sharing a comment with Carl from the shared comment thread, rendered through plain elements
import { afterEach, expect, test } from "bun:test"
import type { SharedCommentSlots } from "@carlnotes/contracts/social"
import { toTestComment, toTestCommentThread } from "@carlnotes/contracts/socialTestFixtures"
import {
	COMMENT_THREAD_LABELS,
	SHARE_WITH_CARL_LABEL,
	SHARED_WITH_CARL_LABEL,
	toSharedCommentSlotsFullLabel,
	toSharedCommentSlotsLabel,
	UNSHARE_WITH_CARL_LABEL,
} from "@carlnotes/core/lib/socialLabels"
import { act } from "react"
import { waitForHook } from "@/lib/hookTestHarness"
import { closeSocialTests, press, renderCommentThread, toComposer, toRows } from "./socialTestHarness"

// keep each test's browser environment and transport isolated
afterEach(closeSocialTests)

test("the share toggle shares a comment with Carl, and the other toggles disable once no shared comment slot is free", async () => {
	const sharedCommentSlots: SharedCommentSlots = { usedCount: 0, slotCount: 1 }
	const { harness, requests } = await renderCommentThread(
		{ firstPage: toTestCommentThread({ sharedCommentSlots }) },
		() => Response.json({ isSharedWithCarl: true, sharedCommentSlots: { usedCount: 1, slotCount: 1 } }),
	)
	const toToggles = (): HTMLButtonElement[] =>
		[...harness.container.querySelectorAll("button")].filter((button) =>
			[SHARE_WITH_CARL_LABEL, UNSHARE_WITH_CARL_LABEL, toSharedCommentSlotsFullLabel(1)].includes(
				button.textContent ?? "",
			),
		)

	// a user who may share reads the count in the card, and sees a toggle on every top-level comment and reply, each free
	// to press
	expect(harness.container.textContent).toContain(toSharedCommentSlotsLabel(sharedCommentSlots))
	expect(toToggles()).toHaveLength(3)
	expect(toToggles().every((toggle) => !toggle.disabled)).toBe(true)
	await press(toRows(harness)[2] as HTMLElement, SHARE_WITH_CARL_LABEL)
	await waitForHook(() => toToggles()[2]?.getAttribute("aria-pressed") === "true")

	// the share names the comment, and with the one shared comment slot used the unshared toggles disable
	expect(requests.at(-1)).toEqual({
		method: "PUT",
		url: "https://carlnotes.test/api/comments/comment-2/share",
		body: { isSharedWithCarl: true },
	})
	expect(toToggles().map((toggle) => toggle.disabled)).toEqual([true, true, false])

	// the disabled toggles say why, and the shared comment's toggle offers taking it back
	expect(toToggles()[0]?.textContent).toBe(toSharedCommentSlotsFullLabel(1))
	expect(toToggles()[2]?.textContent).toBe(UNSHARE_WITH_CARL_LABEL)
})

test("the composer's share switch starts on for an editor, sends its choice, and needs a free shared comment slot", async () => {
	const sharedCommentSlots: SharedCommentSlots = { usedCount: 0, slotCount: 1 }
	const { harness, requests } = await renderCommentThread(
		{ firstPage: toTestCommentThread({ comments: [], sharedCommentSlots }) },
		() => Response.json({ comment: toTestComment({ id: "comment-new" }), sharedCommentSlots }),
	)
	const toSwitch = (): HTMLButtonElement | null => harness.container.querySelector('button[role="switch"]')

	// the switch starts on, and turning it off sends the post unshared
	await press(harness.container, COMMENT_THREAD_LABELS.composeButton)
	expect(toSwitch()?.getAttribute("aria-checked")).toBe("true")
	await act(async () => toSwitch()?.click())
	expect(toSwitch()?.getAttribute("aria-checked")).toBe("false")
	await act(async () => toComposer()?.onChange("Only for the team."))
	await act(async () => toComposer()?.onSubmit())
	expect(requests.at(-1)?.body).toMatchObject({ body: "Only for the team.", isSharedWithCarl: false })
})

test("a reply's composer starts the share switch on and sends the choice", async () => {
	const sharedCommentSlots: SharedCommentSlots = { usedCount: 0, slotCount: 5 }
	const firstPage = toTestCommentThread({
		comments: [toTestComment({ isAuthor: true, isEditable: true })],
		sharedCommentSlots,
	})
	const { harness, requests } = await renderCommentThread({ firstPage }, () =>
		Response.json({ comment: toTestComment({ id: "reply-new", parentCommentId: "comment-1" }), sharedCommentSlots }),
	)
	const toSwitch = (): Element | null => harness.container.querySelector('button[role="switch"]')

	// a reply starts on, and its post says so
	await press(toRows(harness)[0] as HTMLElement, COMMENT_THREAD_LABELS.reply)
	expect(toSwitch()?.getAttribute("aria-checked")).toBe("true")
	await act(async () => toComposer()?.onChange("Same here."))
	await act(async () => toComposer()?.onSubmit())
	expect(requests.at(-1)?.body).toMatchObject({ body: "Same here.", isSharedWithCarl: true })
})

test("an edit's share switch starts from the comment and a changed one shares after the save", async () => {
	const sharedCommentSlots: SharedCommentSlots = { usedCount: 1, slotCount: 5 }
	const ownComment = toTestComment({ isAuthor: true, isEditable: true, isSharedWithCarl: true })
	const { harness, requests } = await renderCommentThread(
		{ firstPage: toTestCommentThread({ comments: [ownComment], sharedCommentSlots }) },
		(request) =>
			request.url.endsWith("/share")
				? Response.json({ isSharedWithCarl: false, sharedCommentSlots: { usedCount: 0, slotCount: 5 } })
				: Response.json({ comment: ownComment, sharedCommentSlots }),
	)
	const toSwitch = (): HTMLButtonElement | null => harness.container.querySelector('button[role="switch"]')

	// the switch shows the comment's share, and turning it off takes the comment back after the edit saves
	await press(toRows(harness)[0] as HTMLElement, COMMENT_THREAD_LABELS.edit)
	expect(toSwitch()?.getAttribute("aria-checked")).toBe("true")
	await act(async () => toSwitch()?.click())
	await act(async () => toComposer()?.onChange("Reworded."))
	await act(async () => toComposer()?.onSubmit())
	await waitForHook(() => requests.at(-1)?.url.endsWith("/share") === true)
	expect(requests.at(-2)).toMatchObject({ method: "PATCH", body: { body: "Reworded." } })
	expect(requests.at(-1)).toMatchObject({ method: "PUT", body: { isSharedWithCarl: false } })
})

test("an aired comment's edit keeps the switch on and disabled, and sends no share", async () => {
	const sharedCommentSlots: SharedCommentSlots = { usedCount: 0, slotCount: 5 }
	const airedComment = toTestComment({ isAuthor: true, isEditable: true, isSharedWithCarl: true, isAired: true })
	const { harness, requests } = await renderCommentThread(
		{ firstPage: toTestCommentThread({ comments: [airedComment], sharedCommentSlots }) },
		() => Response.json({ comment: airedComment, sharedCommentSlots }),
	)
	await press(toRows(harness)[0] as HTMLElement, COMMENT_THREAD_LABELS.edit)
	const shareSwitch = harness.container.querySelector<HTMLButtonElement>('button[role="switch"]')
	expect(shareSwitch?.getAttribute("aria-checked")).toBe("true")
	expect(shareSwitch?.disabled).toBe(true)
	await act(async () => toComposer()?.onChange("Reworded."))
	await act(async () => toComposer()?.onSubmit())
	expect(requests.some((request) => request.url.endsWith("/share"))).toBe(false)
})

test("the composer's share switch is off and disabled with no free shared comment slot", async () => {
	const sharedCommentSlots: SharedCommentSlots = { usedCount: 1, slotCount: 1 }
	const { harness } = await renderCommentThread({ firstPage: toTestCommentThread({ sharedCommentSlots }) })
	await press(harness.container, COMMENT_THREAD_LABELS.composeButton)
	const shareSwitch = harness.container.querySelector<HTMLButtonElement>('button[role="switch"]')
	expect(shareSwitch?.getAttribute("aria-checked")).toBe("false")
	expect(shareSwitch?.disabled).toBe(true)
	expect(shareSwitch?.title).toBe(toSharedCommentSlotsFullLabel(1))
})

test("a user who may not share sees no switch in the composer", async () => {
	const { harness, requests } = await renderCommentThread({ firstPage: toTestCommentThread() })
	await press(harness.container, COMMENT_THREAD_LABELS.composeButton)
	expect(harness.container.querySelector('button[role="switch"]')).toBeNull()
	await act(async () => toComposer()?.onChange("Nice one."))
	await act(async () => toComposer()?.onSubmit())
	expect(requests.at(-1)?.body).not.toHaveProperty("isSharedWithCarl")
})

test("someone else sees the flame on a shared comment alone, with no press", async () => {
	const { harness } = await renderCommentThread({
		firstPage: toTestCommentThread({
			comments: [toTestComment({ isSharedWithCarl: true }), toTestComment({ id: "comment-2" })],
		}),
	})
	const toggles = [...harness.container.querySelectorAll("button")].filter(
		(button) => button.textContent === SHARED_WITH_CARL_LABEL,
	)
	expect(toggles).toHaveLength(1)
	expect(toggles[0]?.disabled).toBe(true)
	expect(toggles[0]?.getAttribute("aria-pressed")).toBe("true")
})
