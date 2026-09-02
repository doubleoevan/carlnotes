// test the chat message footer's relative time label and the attachments a question shows in its own bubble
import { expect, test } from "bun:test"
import type { ChatMessageAttachment } from "@shared/contracts"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { ChatMessages, type ChatTurn, toTimeAgoLabel } from "./ChatMessages"

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

// a clock that reads slightly behind a fresh chat turn still shows just now instead of something negative
test("a future timestamp clamps to just now", () => {
	expect(toTimeAgoLabel(NOW_TIME + 5_000, NOW_TIME)).toBe("just now")
})

// the author lines link to profiles through the router, so every render mounts inside one
const USER = { userId: "user-1", username: "ana", avatarSource: null }

// one question and its reply, rendered with whatever it was sent with
function renderChatTurn(attachments: ChatMessageAttachment[]): string {
	const chatTurn: ChatTurn = {
		question: "what is this",
		answer: "a latte",
		rejection: null,
		attachments,
		linkPreviews: [],
		answerLinkPreviews: [],
	}
	return renderToStaticMarkup(
		<MemoryRouter>
			<ChatMessages chatTurns={[chatTurn]} isEnlarged={false} isStreaming={false} chatName="brew" author={USER} />
		</MemoryRouter>,
	)
}

// an image sent with a question is shown in its bubble instead of being named and nothing else
test("an image sent with a question renders in its bubble", () => {
	const chatMessagesHtml = renderChatTurn([{ id: "attachment-1", kind: "image", name: "latte.png" }])

	// the image points at the chat attachment download route and is named for a screen reader
	expect(chatMessagesHtml).toContain('src="/api/chat-attachments/attachment-1/download"')
	expect(chatMessagesHtml).toContain('alt="latte.png"')
	expect(chatMessagesHtml).toContain('loading="lazy"')
})

// clicking the image opens the full file away from the app, so the router never takes the api path as its own route
test("an image sent with a question opens the full file in a new tab", () => {
	const chatMessagesHtml = renderChatTurn([{ id: "attachment-1", kind: "image", name: "latte.png" }])
	expect(chatMessagesHtml).toContain('href="/api/chat-attachments/attachment-1/download"')
	expect(chatMessagesHtml).toContain('rel="noopener noreferrer"')
})

// only an image is shown in place. a PDF is already named in the question's own text
test("a pdf sent with a question is not rendered", () => {
	const chatMessagesHtml = renderChatTurn([{ id: "attachment-2", kind: "pdf", name: "paper.pdf" }])
	expect(chatMessagesHtml).not.toContain("attachment-2")
})

// a question sent with nothing shows no attachment of its own, only the avatars every chat message has
test("a question with no attachments renders no attachment", () => {
	expect(renderChatTurn([])).not.toContain("/api/chat-attachments/")
})
