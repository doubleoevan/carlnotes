// test the chat message time label, and the private chat's author lines, retry control, and question attachments
import { expect, test } from "bun:test"
import type { ChatMessageAttachment } from "@shared/contracts"
import { ChatMessages, type ChatTurn, toTimeAgoLabel } from "./ChatMessages"
import { renderWithRouter } from "./renderWithRouter"

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

// the user whose questions the private chat renders
const USER = { userId: "user-1", username: "ana", avatarVersion: null }

// one question and its reply, rendered with whatever it was sent with
function renderChatTurn(attachments: ChatMessageAttachment[]): Promise<string> {
	const chatTurn: ChatTurn = {
		question: "what is this",
		answer: "a latte",
		rejection: null,
		attachments,
		linkPreviews: [],
		answerLinkPreviews: [],
	}
	return renderWithRouter(
		<ChatMessages chatTurns={[chatTurn]} isEnlarged={false} isStreaming={false} chatName="topic" author={USER} />,
	)
}

// every chat message includes its author: the user on each question, carl on each answer
test("private chat turns each render their author line", async () => {
	const chatTurns: ChatTurn[] = [
		{
			question: "why this source",
			answer: "because it is reliable",
			at: NOW_TIME,
			rejection: null,
			attachments: [],
			linkPreviews: [],
			answerLinkPreviews: [],
		},
		{
			question: "and this one",
			answer: "same reason",
			at: NOW_TIME + 60_000,
			rejection: null,
			attachments: [],
			linkPreviews: [],
			answerLinkPreviews: [],
		},
	]
	const chatMessagesHtml = await renderWithRouter(
		<ChatMessages chatTurns={chatTurns} isEnlarged={false} isStreaming={false} chatName="topic" author={USER} />,
	)

	// two questions, two answers, four author lines, never collapsed on consecutive chat turns
	expect(chatMessagesHtml.split(">ana<").length - 1).toBe(2)
	expect(chatMessagesHtml.split(">Carl<").length - 1).toBe(2)
	// carl's author line shows his avatar
	expect(chatMessagesHtml).toContain('alt="Carl"')
	// the user's author lines link to their profile, and carl's link nowhere
	expect(chatMessagesHtml.split('href="/profiles/user-1"').length - 1).toBe(2)
	expect(chatMessagesHtml).not.toContain('href="/profiles/"')
})

// a broken reply offers a retry that re-asks the question, with the icon that names the action
test("a failed chat turn renders a retry control", async () => {
	const failedChatTurn: ChatTurn = {
		question: "what is this",
		answer: "",
		rejection: "failed",
		attachments: [],
		linkPreviews: [],
		answerLinkPreviews: [],
	}
	const chatMessagesHtml = await renderWithRouter(
		<ChatMessages
			chatTurns={[failedChatTurn]}
			isEnlarged={false}
			isStreaming={false}
			chatName="topic"
			author={USER}
			onRetry={() => {}}
		/>,
	)
	expect(chatMessagesHtml).toContain("Carl lost his train of thought.")
	expect(chatMessagesHtml).toContain("Try again?")
	// the icon is decoration beside the words, so a screen reader reads the words alone
	expect(chatMessagesHtml).toContain("lucide-rotate-ccw")
	expect(chatMessagesHtml).toContain('aria-hidden="true"')
	// the words lead the icon, which is what puts the button on the sentence's baseline
	expect(chatMessagesHtml.indexOf("Try again?")).toBeLessThan(chatMessagesHtml.indexOf("lucide-rotate-ccw"))
})

// an image sent with a question is shown in its bubble instead of being named and nothing else
test("an image sent with a question renders in its bubble", async () => {
	const chatMessagesHtml = await renderChatTurn([{ id: "attachment-1", kind: "image", name: "latte.png" }])

	// the image points at the chat attachment download route and is named for a screen reader
	expect(chatMessagesHtml).toContain('src="/api/chat-attachments/attachment-1/download"')
	expect(chatMessagesHtml).toContain('alt="latte.png"')
	expect(chatMessagesHtml).toContain('loading="lazy"')
})

// clicking the image opens the full file away from the app, so the router never takes the api path as its own route
test("an image sent with a question opens the full file in a new tab", async () => {
	const chatMessagesHtml = await renderChatTurn([{ id: "attachment-1", kind: "image", name: "latte.png" }])
	expect(chatMessagesHtml).toContain('href="/api/chat-attachments/attachment-1/download"')
	expect(chatMessagesHtml).toContain('rel="noopener noreferrer"')
})

// only an image is shown in place. a PDF is already named in the question's own text
test("a pdf sent with a question is not rendered", async () => {
	const chatMessagesHtml = await renderChatTurn([{ id: "attachment-2", kind: "pdf", name: "paper.pdf" }])
	expect(chatMessagesHtml).not.toContain("attachment-2")
})

// a question sent with nothing shows no attachment of its own, only the avatars every chat message has
test("a question with no attachments renders no attachment", async () => {
	expect(await renderChatTurn([])).not.toContain("/api/chat-attachments/")
})
