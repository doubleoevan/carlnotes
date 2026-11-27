// the suggested reply's swipe: it activates moving right and gives way to a vertical scroll, Android's edges belong to
// the back gesture, and text in the box turns it off
import { expect, test } from "bun:test"
import {
	isSuggestedReplySwipeEnabled,
	isSuggestedReplySwipeStart,
	SUGGESTED_REPLY_SWIPE_OFFSETS,
} from "./suggestedReplySwipe"

test("the swipe activates moving right and fails once the finger moves up or down", () => {
	// a single positive offset activates only past it to the right
	expect(SUGGESTED_REPLY_SWIPE_OFFSETS.activeOffsetX).toBeGreaterThan(0)
	const [failUp, failDown] = SUGGESTED_REPLY_SWIPE_OFFSETS.failOffsetY
	expect(failUp).toBeLessThan(0)
	expect(failDown).toBeGreaterThan(0)
	expect(failDown).toBeLessThan(SUGGESTED_REPLY_SWIPE_OFFSETS.activeOffsetX)
})

test("a swipe that starts in Android's edge zone belongs to the back gesture", () => {
	expect(isSuggestedReplySwipeStart({ startX: 10, screenWidth: 400, platform: "android" })).toBe(false)
	expect(isSuggestedReplySwipeStart({ startX: 390, screenWidth: 400, platform: "android" })).toBe(false)
	expect(isSuggestedReplySwipeStart({ startX: 120, screenWidth: 400, platform: "android" })).toBe(true)
	expect(isSuggestedReplySwipeStart({ startX: 10, screenWidth: 400, platform: "ios" })).toBe(true)
})

test("the swipe is on only while the box is empty and shows a suggestion", () => {
	expect(isSuggestedReplySwipeEnabled({ value: "", suggestedReply: "Weekly is fine" })).toBe(true)
	expect(isSuggestedReplySwipeEnabled({ value: "W", suggestedReply: "Weekly is fine" })).toBe(false)
	expect(isSuggestedReplySwipeEnabled({ value: "", suggestedReply: null })).toBe(false)
})
