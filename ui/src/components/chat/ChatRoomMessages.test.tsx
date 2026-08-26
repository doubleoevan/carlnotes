// render tests for the chat room's messages: the author line shows with every message
import { expect, test } from "bun:test"
import type { ChatRoomMessage } from "@shared/contracts"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { ChatRoomMessages } from "./ChatRoomMessages"

// the author lines link to profiles through the router, so every render mounts inside one
const renderWithRouter = (children: React.ReactNode): string =>
	renderToStaticMarkup(<MemoryRouter>{children}</MemoryRouter>)
// a chat room message with the fields that the message list reads
function chatRoomMessage(overrides: Partial<ChatRoomMessage>): ChatRoomMessage {
	return {
		id: 1,
		authorUserId: "member-1",
		authorUsername: "ana",
		authorAvatarSource: null,
		replyToMessageId: null,
		content: "hello room",
		createdAt: "2026-08-18T12:00:00.000Z",
		attachments: [],
		...overrides,
	}
}

// two messages in a row from one author both show the name. the bubble's author is not inferred from the position
test("consecutive same-author messages each render the correct author line", () => {
	const messages = [
		chatRoomMessage({ id: 1, content: "first" }),
		chatRoomMessage({ id: 2, content: "second" }),
		chatRoomMessage({ id: 3, authorUserId: null, authorUsername: "Carl", content: "an answer" }),
	]
	const messagesHtml = renderWithRouter(
		<ChatRoomMessages
			messages={messages}
			userId="user"
			isEnlarged={false}
			isLeader={false}
			isCarlThinking={false}
			topicId="topic-1"
			teamId="team-1"
			topicName="topic"
			onReplyMessage={() => {}}
			onDeleteAttachment={() => {}}
		/>,
	)

	// the chat member's name appears once per message, never collapsed
	expect(messagesHtml.split(">ana<").length - 1).toBe(2)
	// carl's message shows his name and his avatar
	expect(messagesHtml).toContain(">Carl<")
	expect(messagesHtml).toContain('alt="Carl"')
})

// the user's own message aligns right while everyone else's message aligns left
test("the user's own messages align right", () => {
	const messages = [
		chatRoomMessage({ id: 1, authorUserId: "user" }),
		chatRoomMessage({ id: 2, authorUserId: "member-1" }),
	]
	const messagesHtml = renderWithRouter(
		<ChatRoomMessages
			messages={messages}
			userId="user"
			isEnlarged={false}
			isLeader={false}
			isCarlThinking={false}
			topicId="topic-1"
			teamId="team-1"
			topicName="topic"
			onReplyMessage={() => {}}
			onDeleteAttachment={() => {}}
		/>,
	)

	// the user's bubble has the primary style, and the other bubbles have the muted style
	expect(messagesHtml).toContain("bg-primary")
	expect(messagesHtml).toContain("bg-bubble")
})

// a reply that is earlier that the message above quotes what it answers: the author's name and their words
test("a reply quotes what it answers when it reaches further back", () => {
	const messages = [
		chatRoomMessage({ id: 1, authorUserId: null, authorUsername: "Carl", content: "an answer" }),
		chatRoomMessage({ id: 2, content: "something in between" }),
		chatRoomMessage({ id: 3, replyToMessageId: 1, content: "a follow-up" }),
	]
	const messagesHtml = renderWithRouter(
		<ChatRoomMessages
			messages={messages}
			userId="user"
			isEnlarged={false}
			isLeader={false}
			isCarlThinking={false}
			topicId="topic-1"
			teamId="team-1"
			topicName="topic"
			onReplyMessage={() => {}}
			onDeleteAttachment={() => {}}
		/>,
	)
	// the answered words render twice: the message's own bubble and the quote on the reply
	expect(messagesHtml.split("an answer").length).toBe(3)
})

// answering the message directly above needs no quote
test("a reply to the message directly above shows no quote", () => {
	const messages = [
		chatRoomMessage({ id: 1, authorUserId: null, authorUsername: "Carl", content: "an answer" }),
		chatRoomMessage({ id: 2, replyToMessageId: 1, content: "a follow-up" }),
	]
	const messagesHtml = renderWithRouter(
		<ChatRoomMessages
			messages={messages}
			userId="user"
			isEnlarged={false}
			isLeader={false}
			isCarlThinking={false}
			topicId="topic-1"
			teamId="team-1"
			topicName="topic"
			onReplyMessage={() => {}}
			onDeleteAttachment={() => {}}
		/>,
	)
	expect(messagesHtml.split("an answer").length).toBe(2)
})

// many chat messages render through the virtualized list instead of one bubble per message
test("many chat messages virtualize", () => {
	const messages = Array.from({ length: 40 }, (_, index) =>
		chatRoomMessage({ id: index + 1, content: `line ${index + 1}` }),
	)
	const messagesHtml = renderWithRouter(
		<ChatRoomMessages
			messages={messages}
			userId="user"
			isEnlarged={false}
			isLeader={false}
			isCarlThinking={false}
			topicId="topic-1"
			teamId="team-1"
			topicName="topic"
			onReplyMessage={() => {}}
			onDeleteAttachment={() => {}}
		/>,
	)
	expect(messagesHtml).toContain("virtuoso")
})
