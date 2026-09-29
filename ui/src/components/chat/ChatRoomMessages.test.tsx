// render tests for the chat room's chat messages: author lines, alignment, replies, link previews, attachments,
// and delete controls
import { expect, test } from "bun:test"
import type { ChatRoomMessage } from "@shared/contracts"
import { type ChatRoomState, FIRST_ITEM_INDEX_START } from "@/components/chat/useChatRoom"
import { ChatRoomMessages } from "./ChatRoomMessages"
import { renderWithRouter } from "./renderWithRouter"

// a chat room message with the fields that the chat message list reads
function chatRoomMessage(overrides: Partial<ChatRoomMessage>): ChatRoomMessage {
	return {
		id: 1,
		authorUserId: "member-1",
		authorUsername: "ana",
		authorAvatarSource: null,
		replyToChatMessageId: null,
		content: "hello room",
		createdAt: "2026-08-18T12:00:00.000Z",
		attachments: [],
		linkPreviews: [],
		...overrides,
	}
}

// a loaded chat room with only what the chat message list reads. each test states its chat messages and nothing else
function chatRoom(chatMessages: ChatRoomMessage[]): ChatRoomState {
	return {
		chatMessages,
		isLoaded: true,
		isRejected: false,
		rejection: null,
		clearRejection: () => {},
		isMessageLoading: false,
		postChatMessage: async () => true,
		loadEarlierChatMessages: async () => 0,
		hasEarlierChatMessages: false,
		firstItemIndex: FIRST_ITEM_INDEX_START,
		reloadChatMessages: async () => {},
		loadingChatMessageIds: new Set<number>(),
	}
}

// the user the chat messages list renders for, whether the user leads the team, and the topic. a null topic is the team's chat room
type RenderChatMessagesOptions = { userId?: string; isTeamLeader?: boolean; topicId?: string | null }

// the chat message list as HTML, rendered in topic-1's chat room for member-1 unless the options say otherwise
function renderChatMessages(
	chatMessages: ChatRoomMessage[],
	{ userId = "member-1", isTeamLeader = false, topicId = "topic-1" }: RenderChatMessagesOptions = {},
): Promise<string> {
	return renderWithRouter(
		<ChatRoomMessages
			chatRoom={chatRoom(chatMessages)}
			userId={userId}
			isEnlarged={false}
			isTeamLeader={isTeamLeader}
			isAdmin={false}
			topicId={topicId}
			teamId="team-1"
			chatName="topic"
			onReplyChatMessage={() => {}}
		/>,
	)
}

// two chat messages in a row from one author both show the name. the bubble's author is not inferred from the position
test("consecutive same-author chat messages each render the correct author line", async () => {
	const chatMessages = [
		chatRoomMessage({ id: 1, content: "first" }),
		chatRoomMessage({ id: 2, content: "second" }),
		chatRoomMessage({ id: 3, authorUserId: null, authorUsername: "Carl", content: "an answer" }),
	]
	const chatMessagesHtml = await renderChatMessages(chatMessages, { userId: "user" })

	// the chat member's name appears once per chat message, never collapsed
	expect(chatMessagesHtml.split(">ana<").length - 1).toBe(2)
	// carl's chat message shows his name and his avatar
	expect(chatMessagesHtml).toContain(">Carl<")
	expect(chatMessagesHtml).toContain('alt="Carl"')
})

// the user's own chat message aligns right while everyone else's chat message aligns left
test("the user's own chat messages align right", async () => {
	const chatMessages = [
		chatRoomMessage({ id: 1, authorUserId: "user" }),
		chatRoomMessage({ id: 2, authorUserId: "member-1" }),
	]
	const chatMessagesHtml = await renderChatMessages(chatMessages, { userId: "user" })

	// the user's bubble has the primary style, and the other bubbles have the muted style
	expect(chatMessagesHtml).toContain("bg-primary")
	expect(chatMessagesHtml).toContain("bg-bubble")
})

// a reply that is earlier that the chat message above quotes what it answers: the author's name and their words
test("a reply quotes what it answers when it reaches further back", async () => {
	const chatMessages = [
		chatRoomMessage({ id: 1, authorUserId: null, authorUsername: "Carl", content: "an answer" }),
		chatRoomMessage({ id: 2, content: "something in between" }),
		chatRoomMessage({ id: 3, replyToChatMessageId: 1, content: "a follow-up" }),
	]
	const chatMessagesHtml = await renderChatMessages(chatMessages, { userId: "user" })
	// the answered words render twice: the chat message's own bubble and the quote on the reply
	expect(chatMessagesHtml.split("an answer").length).toBe(3)
})

// answering the chat message directly above needs no quote
test("a reply to the chat message directly above shows no quote", async () => {
	const chatMessages = [
		chatRoomMessage({ id: 1, authorUserId: null, authorUsername: "Carl", content: "an answer" }),
		chatRoomMessage({ id: 2, replyToChatMessageId: 1, content: "a follow-up" }),
	]
	const chatMessagesHtml = await renderChatMessages(chatMessages, { userId: "user" })
	expect(chatMessagesHtml.split("an answer").length).toBe(2)
})

// a link's preview renders as a card below the chat message, and the chat message keeps its own text
test("a link preview renders as a card without replacing the chat message text", async () => {
	const chatMessages = [
		chatRoomMessage({
			id: 1,
			content: "worth a read https://example.com/piece",
			linkPreviews: [
				{
					url: "https://example.com/piece",
					title: "The piece",
					description: "What the piece is about",
					imagePath: "/api/link-previews/link-preview-1/image",
					faviconPath: null,
					youtubeVideoId: null,
				},
			],
		}),
	]
	const chatMessagesHtml = await renderChatMessages(chatMessages, { userId: "user" })

	// the card shows the page's own words and its host
	expect(chatMessagesHtml).toContain("The piece")
	expect(chatMessagesHtml).toContain("What the piece is about")
	expect(chatMessagesHtml).toContain(">example.com<")

	// the image is served from this origin, never from the page's own host
	expect(chatMessagesHtml).toContain('src="/api/link-previews/link-preview-1/image"')

	// the raw url stays in the chat message, so the user always sees where the link goes
	expect(chatMessagesHtml).toContain("worth a read https://example.com/piece")
})

// a chat message whose page offered no image still renders the card, with its words alone
test("a link preview with no image renders the card without one", async () => {
	const chatMessages = [
		chatRoomMessage({
			id: 1,
			content: "https://example.com/piece",
			linkPreviews: [
				{
					url: "https://example.com/piece",
					title: "The piece",
					description: null,
					imagePath: null,
					faviconPath: null,
					youtubeVideoId: null,
				},
			],
		}),
	]
	const chatMessagesHtml = await renderChatMessages(chatMessages, { userId: "user" })

	// the title renders and no image tag is drawn for the card
	expect(chatMessagesHtml).toContain("The piece")
	expect(chatMessagesHtml).not.toContain("link-previews")
})

// a shared clip plays in place and keeps its named download row
test("a video attachment renders a player above its download row", async () => {
	const chatMessagesHtml = await renderChatMessages([
		chatRoomMessage({ attachments: [{ id: "attachment-1", kind: "video", name: "clip.mp4" }] }),
	])

	// the player streams the same gated url the name row downloads
	expect(chatMessagesHtml).toContain("<video")
	expect(chatMessagesHtml).toContain('src="/api/topics/topic-1/room/attachments/attachment-1/download"')
	expect(chatMessagesHtml).toContain("clip.mp4")
})

// many chat messages render through the virtualized list instead of one bubble per chat message
test("many chat messages virtualize", async () => {
	const chatMessages = Array.from({ length: 40 }, (_, index) =>
		chatRoomMessage({ id: index + 1, content: `line ${index + 1}` }),
	)
	const chatMessagesHtml = await renderChatMessages(chatMessages, { userId: "user" })
	expect(chatMessagesHtml).toContain("virtuoso")
})

// a shared image is shown in the bubble instead of being named and nothing else
test("a shared image renders in the chat message", async () => {
	const chatMessagesHtml = await renderChatMessages([
		chatRoomMessage({ attachments: [{ id: "attachment-1", kind: "image", name: "latte.png" }] }),
	])

	// the image points at the chat room's own download route and is named for a screen reader
	expect(chatMessagesHtml).toContain('src="/api/topics/topic-1/room/attachments/attachment-1/download"')
	expect(chatMessagesHtml).toContain('alt="latte.png"')
	expect(chatMessagesHtml).toContain('loading="lazy"')
})

// the name row survives beside the image, so downloading and removing still work
test("a shared image keeps its download link", async () => {
	const chatMessagesHtml = await renderChatMessages(
		[chatRoomMessage({ attachments: [{ id: "attachment-1", kind: "image", name: "latte.png" }] })],
		{ isTeamLeader: true },
	)
	expect(chatMessagesHtml).toContain('download="latte.png"')
	expect(chatMessagesHtml).toContain("Delete latte.png")
})

// only an image is shown in place. a pdf stays a named row with no img tag of its own
test("a shared pdf is named without rendering", async () => {
	const chatMessagesHtml = await renderChatMessages([
		chatRoomMessage({ attachments: [{ id: "attachment-2", kind: "pdf", name: "paper.pdf" }] }),
	])
	expect(chatMessagesHtml).toContain("paper.pdf")
	expect(chatMessagesHtml).not.toContain("<img")
})

// the team's own chat room downloads from the team routes, and the image follows that url
test("a team room image reads from the team route", async () => {
	const chatMessagesHtml = await renderChatMessages(
		[chatRoomMessage({ attachments: [{ id: "a-1", kind: "image", name: "shot.png" }] })],
		{ topicId: null },
	)
	expect(chatMessagesHtml).toContain('src="/api/teams/team-1/room/attachments/a-1/download"')
})

// the sender gets a delete control on their own chat message
test("a sender's own chat message offers delete", async () => {
	const chatMessagesHtml = await renderChatMessages([chatRoomMessage({ authorUserId: "member-1" })])
	expect(chatMessagesHtml).toContain('aria-label="Delete message"')
})

// someone else's chat message is not an ordinary member's to remove
test("another member's chat message offers no delete", async () => {
	const chatMessagesHtml = await renderChatMessages([
		chatRoomMessage({ authorUserId: "member-2", authorUsername: "bo" }),
	])
	expect(chatMessagesHtml).not.toContain('aria-label="Delete message"')
})

// a leader removes anyone's chat message, the same rule that already governs a shared file
test("a leader may delete another member's chat message", async () => {
	const chatMessagesHtml = await renderChatMessages(
		[chatRoomMessage({ authorUserId: "member-2", authorUsername: "bo" })],
		{ isTeamLeader: true },
	)
	expect(chatMessagesHtml).toContain('aria-label="Delete message"')
})

// carl writes with no account of his own, so no ordinary member owns his answers
test("carl's chat message offers no delete to a member", async () => {
	const chatMessagesHtml = await renderChatMessages([chatRoomMessage({ authorUserId: null, authorUsername: "Carl" })])
	expect(chatMessagesHtml).not.toContain('aria-label="Delete message"')
})

// a leader may already clear the whole chat room, so one of carl's answers is theirs to remove too
test("a leader may delete carl's chat message", async () => {
	const chatMessagesHtml = await renderChatMessages([chatRoomMessage({ authorUserId: null, authorUsername: "Carl" })], {
		isTeamLeader: true,
	})
	expect(chatMessagesHtml).toContain('aria-label="Delete message"')
})

// a YouTube link's card offers to play in place, and no player loads until the play button is pressed
test("a youtube link preview renders a play button and no player", async () => {
	const chatMessagesHtml = await renderChatMessages([
		chatRoomMessage({
			content: "https://youtu.be/dQw4w9WgXcQ",
			linkPreviews: [
				{
					url: "https://youtu.be/dQw4w9WgXcQ",
					title: "A video",
					description: null,
					imagePath: "/api/link-previews/link-preview-2/image",
					faviconPath: null,
					youtubeVideoId: "dQw4w9WgXcQ",
				},
			],
		}),
	])
	expect(chatMessagesHtml).toContain('aria-label="Play A video"')
	expect(chatMessagesHtml).not.toContain("<iframe")
})
