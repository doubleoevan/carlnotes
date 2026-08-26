// test the chat message footer's relative time label, from "just now" through days
import { expect, test } from "bun:test"
import { toTimeAgoLabel } from "./ChatMessages"

// a fixed "now" time so the test cases read as plain arithmetic
const NOW_TIME = 1_700_000_000_000

// each time label unit replaces a smaller one, singular and plural spelled apart
test("the label walks from just now through days", () => {
	// under a minute reads as just now, then minutes take over
	expect(toTimeAgoLabel(NOW_TIME - 30_000, NOW_TIME)).toBe("just now")
	expect(toTimeAgoLabel(NOW_TIME - 60_000, NOW_TIME)).toBe("1 minute ago")
	expect(toTimeAgoLabel(NOW_TIME - 2 * 60_000, NOW_TIME)).toBe("2 minutes ago")

	// hours label the rest of the day, then days
	expect(toTimeAgoLabel(NOW_TIME - 60 * 60_000, NOW_TIME)).toBe("1 hour ago")
	expect(toTimeAgoLabel(NOW_TIME - 5 * 60 * 60_000, NOW_TIME)).toBe("5 hours ago")
	expect(toTimeAgoLabel(NOW_TIME - 24 * 60 * 60_000, NOW_TIME)).toBe("1 day ago")
	expect(toTimeAgoLabel(NOW_TIME - 72 * 60 * 60_000, NOW_TIME)).toBe("3 days ago")
})

// a clock that reads slightly behind a fresh chat turn still says just now instead of something negative
test("a future timestamp clamps to just now", () => {
	expect(toTimeAgoLabel(NOW_TIME + 5_000, NOW_TIME)).toBe("just now")
})
