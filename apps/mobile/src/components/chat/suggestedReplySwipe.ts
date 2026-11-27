// the swipe that accepts an empty private chat box's suggested reply: the pan's settings, so a vertical drag
// scrolls the conversation instead, and the start that Android's back gesture owns at either edge of the screen

// how far right a finger moves before the swipe accepts the suggestion, and how far up or down before it gives way to a scroll
const ACTIVATE_RIGHT_POINTS = 24
const FAIL_VERTICAL_POINTS = 12

// how wide Android's back gesture zone is at either edge of the screen, in density-independent pixels
const ANDROID_EDGE_GESTURE_DP = 32

/**
 * The pan's settings: it activates on a move right past its threshold, never on a move left, and fails once the finger
 * moves up or down past its own, which lets the list scroll.
 */
export const SUGGESTED_REPLY_SWIPE_OFFSETS = {
	activeOffsetX: ACTIVATE_RIGHT_POINTS,
	failOffsetY: [-FAIL_VERTICAL_POINTS, FAIL_VERTICAL_POINTS] as [number, number],
}

// where a swipe started, the screen's width, and the platform it runs on
type SwipeStart = { startX: number; screenWidth: number; platform: string }

/**
 * Whether a swipe that started here may accept the suggestion. On Android a start inside the back gesture's zone at either
 * edge belongs to the back gesture.
 */
export function isSuggestedReplySwipeStart({ startX, screenWidth, platform }: SwipeStart): boolean {
	if (platform !== "android") {
		return true
	}
	return startX > ANDROID_EDGE_GESTURE_DP && startX < screenWidth - ANDROID_EDGE_GESTURE_DP
}

/**
 * Whether the swipe is on: only while the box is empty and shows a suggestion, so text in the box keeps its cursor and
 * its selection.
 */
export function isSuggestedReplySwipeEnabled({
	value,
	suggestedReply,
}: {
	value: string
	suggestedReply: string | null
}): boolean {
	return value === "" && suggestedReply !== null
}
