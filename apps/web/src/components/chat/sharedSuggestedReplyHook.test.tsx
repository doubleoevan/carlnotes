// the shared suggested reply rule: when an empty, idle composer shows a suggestion, which one, how it is counted and
// announced once, and how accepting puts it in the box without sending
import { afterEach, expect, test } from "bun:test"
import type { ChatPage } from "@carlnotes/client/chatClient"
import { type SuggestedReplyEvent, useSuggestedReply } from "@carlnotes/core/hooks/useSuggestedReply"
import type { TopicChat } from "@carlnotes/core/hooks/useTopicChat"
import { NEW_TOPIC_EXAMPLE_TOPICS } from "@carlnotes/core/lib/chatCopy"
import { act, useState } from "react"
import { type HookTestHarness, renderTestHook } from "@/lib/hookTestHarness"
import { toTestChatTurn } from "./chatRoomTestFixtures"
import { toTestReceivedSuggestedReply } from "./topicChatTestFixtures"

// each test closes its mounted harness
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
	for (const close of cleanups.splice(0).reverse()) {
		await close()
	}
})

// the conversation fields the rule reads, each settable by the test
type TestChat = Parameters<typeof useSuggestedReply>[0]["topicChat"]

// what a test controls: the conversation, the busy composer, and the page
type SuggestedReplyTestControls = {
	setChat: (change: Partial<TestChat>) => void
	setIsComposerBusy: (isBusy: boolean) => void
	setPage: (page: ChatPage) => void
}

// the mounted rule, the events and announcements it made, and the change that edits its conversation
type MountedSuggestedReply = {
	harness: HookTestHarness<ReturnType<typeof useSuggestedReply> & { question: string }>
	events: SuggestedReplyEvent[]
	announcements: string[]
	change: (apply: (currentControls: SuggestedReplyTestControls) => void) => Promise<void>
}

// mount the rule over a conversation the test edits, recording each event and announcement
async function mountSuggestedReply(
	initialChat: Partial<TestChat>,
	initialPage: ChatPage = { topicId: "topic-1" },
): Promise<MountedSuggestedReply> {
	const events: SuggestedReplyEvent[] = []
	const announcements: string[] = []
	let controls: SuggestedReplyTestControls | undefined
	const harness: HookTestHarness<ReturnType<typeof useSuggestedReply> & { question: string }> = await renderTestHook(
		() => {
			// the conversation's state, which the accept writes the question into
			const [chat, setChatState] = useState<TestChat>({
				chatTurns: [],
				question: "",
				setQuestion: () => {},
				attachments: [],
				isStreaming: false,
				receivedSuggestedReply: null,
				isSuggestedReplyOn: true,
				isLoaded: true,
				canChat: true,
				isSignupRequired: false,
				topicsRemaining: null,
				...initialChat,
			})
			const [isComposerBusy, setIsComposerBusy] = useState(false)
			const [page, setPage] = useState<ChatPage>(initialPage)
			controls = {
				setChat: (change) => setChatState((previousChat) => ({ ...previousChat, ...change })),
				setIsComposerBusy,
				setPage,
			}
			// the rule, with the accept writing the question back into the conversation
			const suggestedReply = useSuggestedReply({
				page,
				topicChat: {
					...chat,
					setQuestion: (question) => setChatState((previousChat) => ({ ...previousChat, question })),
				} as TopicChat,
				isComposerBusy,
				onSuggestedReplyEvent: (suggestedReplyEvent) => events.push(suggestedReplyEvent),
				onSuggestedReplyShown: (text) => announcements.push(text),
				pickExampleTopic: () => 1,
			})
			return { ...suggestedReply, question: chat.question }
		},
	)
	cleanups.push(harness.close)
	// apply one change inside act
	const change = async (apply: (currentControls: SuggestedReplyTestControls) => void): Promise<void> => {
		await act(async () => {
			if (controls) {
				apply(controls)
			}
		})
	}
	return { harness, events, announcements, change }
}

test("typing hides the suggestion and clearing the box shows it again, announced and counted once", async () => {
	const { harness, events, announcements, change } = await mountSuggestedReply({
		chatTurns: [toTestChatTurn({ spokenAnswerKey: "turn-1" })],
		receivedSuggestedReply: toTestReceivedSuggestedReply({ spokenAnswerKey: "turn-1" }),
	})
	expect(harness.read().suggestedReply).toBe("Weekly is fine")

	// a letter hides it, and an empty box shows it again
	await change(({ setChat }) => setChat({ question: "W" }))
	expect(harness.read().suggestedReply).toBeNull()
	await change(({ setChat }) => setChat({ question: "" }))
	expect(harness.read().suggestedReply).toBe("Weekly is fine")

	// one shown event with no text, and one announcement
	expect(events).toEqual([{ event: "shown", chatKind: "topic", isTopicPost: false, origin: "reply" }])
	expect(announcements).toEqual(["Weekly is fine"])
	expect(JSON.stringify(events)).not.toContain("Weekly")
})

test("accepting puts the suggestion in the box and counts how, with no text", async () => {
	const { harness, events } = await mountSuggestedReply({
		chatTurns: [toTestChatTurn({ spokenAnswerKey: "turn-1" })],
		receivedSuggestedReply: toTestReceivedSuggestedReply({ spokenAnswerKey: "turn-1" }),
	})
	await act(async () => harness.read().accept("arrowKey"))
	expect(harness.read().question).toBe("Weekly is fine")
	expect(events.at(-1)).toEqual({
		event: "accepted",
		chatKind: "topic",
		isTopicPost: false,
		origin: "reply",
		acceptMethod: "arrowKey",
	})
	expect(JSON.stringify(events)).not.toContain("Weekly")
})

test("an earlier turn's suggestion, another account's, and a dropped one never show", async () => {
	// a suggestion for the first turn after a second turn was sent
	const { harness, change } = await mountSuggestedReply({
		chatTurns: [toTestChatTurn({ spokenAnswerKey: "turn-1" }), toTestChatTurn({ spokenAnswerKey: "turn-2" })],
		receivedSuggestedReply: toTestReceivedSuggestedReply({ spokenAnswerKey: "turn-1" }),
	})
	expect(harness.read().suggestedReply).toBeNull()

	// a suggestion whose account or conversation is no longer on screen
	await change(({ setChat }) =>
		setChat({ receivedSuggestedReply: toTestReceivedSuggestedReply({ spokenAnswerKey: "turn-2", isCurrent: false }) }),
	)
	expect(harness.read().suggestedReply).toBeNull()

	// a send or a clear drops it from the conversation
	await change(({ setChat }) =>
		setChat({ receivedSuggestedReply: toTestReceivedSuggestedReply({ spokenAnswerKey: "turn-2" }) }),
	)
	expect(harness.read().suggestedReply).toBe("Weekly is fine")
	await change(({ setChat }) => setChat({ receivedSuggestedReply: null }))
	expect(harness.read().suggestedReply).toBeNull()
})

test("attachments, streaming, a recording, voice, a visitor, and a load that says off hide it", async () => {
	const { harness, change } = await mountSuggestedReply({
		chatTurns: [toTestChatTurn({ spokenAnswerKey: "turn-1" })],
		receivedSuggestedReply: toTestReceivedSuggestedReply({ spokenAnswerKey: "turn-1" }),
	})
	// each condition alone hides it, and putting it back shows it again
	const hidingChanges: Partial<TestChat>[] = [
		{ attachments: [{ kind: "text", name: "notes.md", text: "notes", keep: false }] },
		{ isStreaming: true },
		{ isSignupRequired: true },
		{ canChat: false },
		{ isSuggestedReplyOn: false },
	]
	for (const hidingChange of hidingChanges) {
		await change(({ setChat }) => setChat(hidingChange))
		expect(harness.read().suggestedReply).toBeNull()
		await change(({ setChat }) =>
			setChat({
				attachments: [],
				isStreaming: false,
				isSignupRequired: false,
				canChat: true,
				isSuggestedReplyOn: true,
			}),
		)
		expect(harness.read().suggestedReply).toBe("Weekly is fine")
	}

	// a recording, a transcript on its way, or the voice composer
	await change(({ setIsComposerBusy }) => setIsComposerBusy(true))
	expect(harness.read().suggestedReply).toBeNull()
})

test("an empty new-topic chat shows an example only while the plan holds another topic", async () => {
	const { harness, events, change } = await mountSuggestedReply({}, { newTopic: true })
	expect(harness.read().suggestedReply).toBe(NEW_TOPIC_EXAMPLE_TOPICS[1])
	expect(events).toEqual([{ event: "shown", chatKind: "new_topic", isTopicPost: false, origin: "example" }])

	// a full plan shows none, and a conversation that has turns shows none
	await change(({ setChat }) => setChat({ topicsRemaining: 0 }))
	expect(harness.read().suggestedReply).toBeNull()
	await change(({ setChat }) =>
		setChat({ topicsRemaining: 2, chatTurns: [toTestChatTurn({ spokenAnswerKey: "turn-1" })] }),
	)
	expect(harness.read().suggestedReply).toBeNull()
})

test("a Topic's chat shows no example topic, and a Topic Post's chat counts as its own kind", async () => {
	const { harness, events, change } = await mountSuggestedReply({})
	expect(harness.read().suggestedReply).toBeNull()

	// a suggestion on a Topic Post's page
	await change(({ setPage, setChat }) => {
		setPage({ topicId: "topic-1", topicPost: { id: "post-1", title: "Grinders", path: "/posts/post-1" } })
		setChat({
			chatTurns: [toTestChatTurn({ spokenAnswerKey: "turn-1" })],
			receivedSuggestedReply: toTestReceivedSuggestedReply({ spokenAnswerKey: "turn-1" }),
		})
	})
	expect(harness.read().suggestedReply).toBe("Weekly is fine")
	expect(events).toEqual([{ event: "shown", chatKind: "topic", isTopicPost: true, origin: "reply" }])
})
