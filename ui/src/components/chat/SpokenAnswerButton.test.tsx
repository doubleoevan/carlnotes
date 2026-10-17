// render tests for carl's play button in the private chat and the chat room
import { expect, test } from "bun:test"
import type { ChatRoomMessage } from "@shared/contracts/chat"
import { ChatMessages } from "./ChatMessages"
import { ChatRoomMessages } from "./ChatRoomMessages"
import { toTestChatRoomMessage, toTestChatRoomState, toTestChatTurn } from "./chatRoomTestFixtures"
import type { ChatTurn } from "./chatTurns"
import { renderWithRouter } from "./renderWithRouter"

// the play button's accessible name
const PLAY_BUTTON = 'aria-label="Play message"'

// how many times a name appears in the rendered markup
function toMarkupCount(html: string, accessibleName: string): number {
	return html.split(accessibleName).length - 1
}

// the user the chat messages render for
const USER = { userId: "user-1", username: "ana", avatarVersion: null }

// the private chat's list as HTML, with voice on unless the test turns it off
function renderChatMessages(chatTurns: ChatTurn[], isVoiceChatConfigured = true): Promise<string> {
	return renderWithRouter(
		<ChatMessages
			chatTurns={chatTurns}
			isEnlarged={false}
			isStreaming={false}
			chatName="topic"
			author={USER}
			voiceChatPage={isVoiceChatConfigured ? { kind: "topic", topicId: "topic-1" } : null}
		/>,
	)
}

// every reply has the play button while voice is on, whether the question was spoken or typed, and no message shows a
// mic icon
test("every reply in the private chat has the play button and no mic icon", async () => {
	const spokenHtml = await renderChatMessages([toTestChatTurn()])
	expect(toMarkupCount(spokenHtml, PLAY_BUTTON)).toBe(1)
	expect(spokenHtml).not.toContain("lucide-mic")

	// with voice off, no reply has one
	const voiceOffHtml = await renderChatMessages([toTestChatTurn()], false)
	expect(voiceOffHtml).not.toContain(PLAY_BUTTON)
})

// the chat room's list as HTML, for member-1 in topic-1's chat room
function renderChatRoomMessages(chatMessages: ChatRoomMessage[], isVoiceChatConfigured: boolean): Promise<string> {
	const chatRoom = toTestChatRoomState({
		chatMessages,
		voiceChatPage: isVoiceChatConfigured ? { kind: "room", topicId: "topic-1", teamId: "team-1" } : null,
	})
	return renderWithRouter(
		<ChatRoomMessages
			chatRoom={chatRoom}
			userId="member-1"
			isEnlarged={false}
			isTeamLeader={false}
			isAdmin={false}
			topicId="topic-1"
			teamId="team-1"
			chatName="topic"
			onReplyChatMessage={() => {}}
		/>,
	)
}

// in a chat room the play button is carl's alone, and a member's message never has one
test("the chat room shows the play button on carl's message alone", async () => {
	const chatMessages = [
		toTestChatRoomMessage({ id: 1, content: "@carl what is this", isSpoken: true }),
		toTestChatRoomMessage({
			id: 2,
			authorUserId: null,
			authorUsername: "Carl",
			replyToChatMessageId: 1,
			content: "a latte",
			isSpoken: true,
		}),
	]
	const spokenHtml = await renderChatRoomMessages(chatMessages, true)
	expect(toMarkupCount(spokenHtml, PLAY_BUTTON)).toBe(1)

	// voice off drops it
	const voiceOffHtml = await renderChatRoomMessages(chatMessages, false)
	expect(voiceOffHtml).not.toContain(PLAY_BUTTON)
})
