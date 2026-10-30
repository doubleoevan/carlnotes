// the skip that a story's own globals cause: a pinned viewport skips the other size,
// a pinned theme skips the other theme, and a story that pins nothing is captured everywhere
import { expect, test } from "bun:test"
import { type StoryCapture, toPinnedSkipReason } from "./capturePage"

// a Latte story capture at the phone size
const PHONE_STORY_CAPTURE: StoryCapture = {
	storyId: "layout-usermenu--open",
	theme: "light",
	sizeName: "phone",
	width: 375,
	height: 812,
}

// a story pinned to the desktop viewport is skipped at the phone size and captured at the desktop size
test("a pinned viewport skips the other size", () => {
	const desktopGlobals = { viewport: { value: "desktop" } }
	expect(toPinnedSkipReason(desktopGlobals, PHONE_STORY_CAPTURE)).toBe("the story pins the desktop viewport")
	expect(toPinnedSkipReason(desktopGlobals, { ...PHONE_STORY_CAPTURE, sizeName: "desktop", width: 1280 })).toBeNull()
})

// a story pinned to the dark theme is skipped in Latte and captured in Dark roast
test("a pinned theme skips the other theme", () => {
	expect(toPinnedSkipReason({ theme: "dark" }, PHONE_STORY_CAPTURE)).toBe("the story pins the dark theme")
	expect(toPinnedSkipReason({ theme: "dark" }, { ...PHONE_STORY_CAPTURE, theme: "dark" })).toBeNull()
})

// a story that pins nothing is captured at every size in every theme
test("a story that pins nothing is never skipped", () => {
	expect(toPinnedSkipReason({}, PHONE_STORY_CAPTURE)).toBeNull()
})
