// a Share dialog's page share: the copy reports its channel and shows its confirmation, and a share sheet the browser
// cannot open reports itself and falls back to the copy
import { expect, test } from "bun:test"
import { act } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"
import { COPY_PAGE_LABEL } from "./ShareOptions"
import { usePageShare } from "./usePageShare"

test("the copy and the share sheet report their channels, and a missing sheet falls back to the copy", async () => {
	// the channels reported and the text copied
	const channels: string[] = []
	const copiedTexts: string[] = []
	const harness = await renderTestHook(() =>
		usePageShare({
			title: "vienna's Podcast Specials",
			url: "https://carlnotes.com/profiles/user-vienna/specials/podcasts",
			onShareOptionClick: (channel) => channels.push(channel),
		}),
	)
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: { writeText: async (text: string) => copiedTexts.push(text) },
	})
	try {
		// the copy shows its confirmation
		await act(async () => harness.read().copyLink(COPY_PAGE_LABEL, "https://carlnotes.com/a"))
		expect(harness.read().copiedLabel).toBe(COPY_PAGE_LABEL)

		// a browser with no share sheet copies the page's url instead
		await act(async () => harness.read().sharePage())
		expect(channels).toEqual(["copy-link", "share-sheet", "copy-link"])
		expect(copiedTexts).toEqual([
			"https://carlnotes.com/a",
			"https://carlnotes.com/profiles/user-vienna/specials/podcasts",
		])
	} finally {
		await harness.close()
	}
})
