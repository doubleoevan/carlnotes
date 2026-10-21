// the chat room's rejection notice names why a post was rejected
import { expect, test } from "bun:test"
import { ChatRoomRejectionNotice } from "./ChatRoomPanel"
import { renderWithRouter } from "./renderWithRouter"

// a spent budget shows the notice that links to the plans page
test("a budget rejection shows the plans notice", async () => {
	const noticeHtml = await renderWithRouter(<ChatRoomRejectionNotice rejection="budget" />)
	expect(noticeHtml).toContain("empty mug")
	expect(noticeHtml).toContain('href="/plans"')
})

// a file rejection says why the files did not post, and never claims the budget ran out
test("a file rejection says why the files did not post", async () => {
	const limitHtml = await renderWithRouter(<ChatRoomRejectionNotice rejection="attachmentLimitReached" />)
	expect(limitHtml).toContain("files you can share in this chat room")
	expect(limitHtml).not.toContain("empty mug")

	// an unreadable file names the unreadable file
	const unreadableHtml = await renderWithRouter(<ChatRoomRejectionNotice rejection="attachmentRejected" />)
	expect(unreadableHtml).toContain("One of them may be unreadable.")
	expect(unreadableHtml).not.toContain("empty mug")
})
