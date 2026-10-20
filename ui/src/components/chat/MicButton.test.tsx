// render tests for the mic in both composers' send slots and for the recording bar's controls
import { expect, test } from "bun:test"
import { EMPTY_TOPIC_DRAFT } from "@shared/topicPayloads"
import { TEST_TOPIC_VOICE_CHAT_PAGE } from "@/clients/voiceClientTestFixtures"
import { ChatComposer } from "./ChatComposer"
import { ChatRoomComposer } from "./ChatRoomComposer"
import { RecordingBar } from "./RecordingBar"
import { renderWithRouter } from "./renderWithRouter"
import type { TopicChat } from "./useTopicChat"
import type { VoiceRecording } from "./useVoiceRecording"

// a loaded private chat with voice on and nothing typed. each test states what differs
function toTestTopicChat(overrides: Partial<TopicChat>): TopicChat {
	return {
		chatTurns: [],
		question: "",
		setQuestion: () => {},
		attachments: [],
		addAttachmentFiles: async () => [],
		addPastedText: () => {},
		removeAttachment: () => {},
		keptAttachments: [],
		removeKeptAttachment: async () => {},
		canChat: true,
		isSignupRequired: false,
		isBudgetExhausted: false,
		canEditTopic: false,
		isFirstTopic: false,
		topicsRemaining: null,
		topicLimit: null,
		isVoiceChatConfigured: true,
		isLoaded: true,
		editableTopicDraft: null,
		topicDraft: EMPTY_TOPIC_DRAFT,
		topicDraftAttachmentFiles: [],
		removeTopicDraftAttachmentFile: () => {},
		isStreaming: false,
		voiceChatPage: TEST_TOPIC_VOICE_CHAT_PAGE,
		send: async () => {},
		stop: () => {},
		clear: async () => true,
		...overrides,
	}
}

// the private chat's composer as HTML
function renderChatComposer(overrides: Partial<TopicChat>): Promise<string> {
	return renderWithRouter(<ChatComposer chat={toTestTopicChat(overrides)} onSendQuestion={() => {}} />)
}

// the chat room's composer as HTML, with voice on unless the test turns it off
function renderChatRoomComposer(isVoiceChatConfigured: boolean): Promise<string> {
	return renderWithRouter(
		<ChatRoomComposer
			memberUsernames={["ana"]}
			reply={{ replyTo: null, isAutoReply: false, replyChatMessages: [], selectChatMessage: () => {}, clear: () => {} }}
			voiceChatPage={isVoiceChatConfigured ? { kind: "room", topicId: "topic-1", teamId: "team-1" } : null}
			onPostChatMessage={async () => true}
		/>,
	)
}

// an empty box offers the mic in the send slot, and a typed character brings the send button back
test("the private chat's empty box shows the mic and a draft shows send", async () => {
	const emptyComposerHtml = await renderChatComposer({})
	expect(emptyComposerHtml).toContain('aria-label="Talk to Carl"')
	expect(emptyComposerHtml).not.toContain('aria-label="Send"')

	// a draft, or an attachment alone, takes the slot back for the send button
	const draftComposerHtml = await renderChatComposer({ question: "hi" })
	expect(draftComposerHtml).toContain('aria-label="Send"')
	expect(draftComposerHtml).not.toContain('aria-label="Talk to Carl"')
	const attachmentComposerHtml = await renderChatComposer({
		attachments: [{ kind: "text", name: "Pasted text", text: "pasted", keep: false }],
	})
	expect(attachmentComposerHtml).toContain('aria-label="Send"')
	expect(attachmentComposerHtml).not.toContain('aria-label="Talk to Carl"')
})

// with voice off, or while a reply streams, the slot never holds the mic
test("the private chat hides the mic with voice off and while streaming", async () => {
	const voiceOffComposerHtml = await renderChatComposer({ isVoiceChatConfigured: false, voiceChatPage: null })
	expect(voiceOffComposerHtml).toContain('aria-label="Send"')
	expect(voiceOffComposerHtml).not.toContain('aria-label="Talk to Carl"')

	// a streaming reply shows stop
	const streamingComposerHtml = await renderChatComposer({ isStreaming: true })
	expect(streamingComposerHtml).toContain('aria-label="Stop"')
	expect(streamingComposerHtml).not.toContain('aria-label="Talk to Carl"')
})

// a visitor's empty box shows the mic, whose tap routes to signup, and a draft shows the signup arrow
test("a visitor's empty box shows the mic and a draft shows the signup arrow", async () => {
	const visitorComposerHtml = await renderChatComposer({ isSignupRequired: true })
	expect(visitorComposerHtml).toContain('aria-label="Talk to Carl"')
	const visitorDraftHtml = await renderChatComposer({ isSignupRequired: true, question: "hi" })
	expect(visitorDraftHtml).toContain('aria-label="Sign up to chit-chat"')
	expect(visitorDraftHtml).not.toContain('aria-label="Talk to Carl"')
})

// the chat room's composer follows the same rule, on whether the room page says voice is on
test("the chat room's empty box shows the mic only with voice on", async () => {
	expect(await renderChatRoomComposer(true)).toContain('aria-label="Talk to Carl"')
	const voiceOffComposerHtml = await renderChatRoomComposer(false)
	expect(voiceOffComposerHtml).toContain('aria-label="Send"')
	expect(voiceOffComposerHtml).not.toContain('aria-label="Talk to Carl"')
})

// the bar's four controls: cancel, the meter, the timer in minutes and seconds, and send
test("the recording bar names cancel and send and shows the timer", async () => {
	const voiceRecording: VoiceRecording = {
		state: "recording",
		isListening: true,
		level: 0.3,
		secondsElapsed: 65,
		start: () => {},
		send: () => {},
		cancel: () => {},
		stopListening: () => {},
	}
	const recordingBarHtml = await renderWithRouter(<RecordingBar voiceRecording={voiceRecording} />)
	expect(recordingBarHtml).toContain('aria-label="Cancel"')
	expect(recordingBarHtml).toContain('aria-label="Send"')
	expect(recordingBarHtml).toContain(">1:05<")
	// the meter fills with the level the recorder already scaled
	expect(recordingBarHtml).toContain("width:30%")
})
