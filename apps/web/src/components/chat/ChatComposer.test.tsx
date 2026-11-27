// the web composer's suggested reply: Right Arrow in an empty box accepts it with the caret at its end, Tab is left to move
// focus, Right Arrow in text and during an input method composition is left alone, the button accepts by click and by
// keyboard, nothing is sent, and the suggestion is announced once and named on the button
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as auth from "@carlnotes/client/authClient"
import type { ChatPage } from "@carlnotes/client/chatClient"
import type { ReceivedSuggestedReply } from "@carlnotes/core/hooks/useTopicChat"
import { NEW_TOPIC_EXAMPLE_TOPICS } from "@carlnotes/core/lib/chatCopy"
import { act, useState } from "react"
import { TooltipProvider } from "@/components/primitives/tooltip"
import { type HookTestHarness, renderTestHook } from "@/lib/hookTestHarness"
import { ChatComposer } from "./ChatComposer"
import { toTestChatTurn } from "./chatRoomTestFixtures"
import { toTestReceivedSuggestedReply, toTestTopicChat } from "./topicChatTestFixtures"
import type { TopicChat } from "./useTopicChat"

// each test gets a signed-out session for the mic's pause action, and closes its mounted composer
const cleanups: (() => Promise<void>)[] = []
beforeEach(() => {
	spyOn(auth, "authClient").mockReturnValue({
		useSession: () => ({ data: null, isPending: false }),
	} as unknown as ReturnType<typeof auth.authClient>)
})
afterEach(async () => {
	for (const close of cleanups.splice(0).reverse()) {
		await close()
	}
	mock.restore()
})

// the suggestion a finished chat turn left
const SUGGESTED_REPLY = "Weekly is fine"
const RECEIVED_SUGGESTED_REPLY: ReceivedSuggestedReply = toTestReceivedSuggestedReply({ text: SUGGESTED_REPLY })

// a loaded private chat whose last turn left a suggestion, with voice off and nothing typed
function toSuggestedReplyTopicChat({
	question,
	setQuestion,
	onSend,
}: {
	question: string
	setQuestion: (question: string) => void
	onSend: () => void
}): TopicChat {
	return toTestTopicChat({
		chatTurns: [toTestChatTurn()],
		question,
		setQuestion,
		isSuggestedReplyOn: true,
		receivedSuggestedReply: RECEIVED_SUGGESTED_REPLY,
		send: async () => {
			onSend()
		},
	})
}

// mount the composer on a topic's page, counting its sends
async function mountComposer(
	initialQuestion = "",
	{ page = { topicId: "topic-1" }, chatOverrides = {} }: { page?: ChatPage; chatOverrides?: Partial<TopicChat> } = {},
): Promise<{ harness: HookTestHarness<string>; sendCount: () => number }> {
	let sentCount = 0
	const harness = await renderTestHook(
		() => "",
		() => (
			<ComposerUnderTest
				page={page}
				initialQuestion={initialQuestion}
				chatOverrides={chatOverrides}
				onSend={() => (sentCount += 1)}
			/>
		),
	)
	cleanups.push(harness.close)
	return { harness, sendCount: () => sentCount }
}

// the composer over its own question state
function ComposerUnderTest({
	page,
	initialQuestion,
	chatOverrides,
	onSend,
}: {
	page: ChatPage
	initialQuestion: string
	chatOverrides: Partial<TopicChat>
	onSend: () => void
}) {
	const [question, setQuestion] = useState(initialQuestion)
	const chat = { ...toSuggestedReplyTopicChat({ question, setQuestion, onSend }), ...chatOverrides }
	return (
		<TooltipProvider>
			<ChatComposer chat={chat} onSendQuestion={() => void chat.send()} page={page} placeholder="Usual line" />
		</TooltipProvider>
	)
}

// the question box
function toQuestionBox(harness: HookTestHarness<string>): HTMLTextAreaElement {
	const questionBox = harness.container.querySelector("textarea")
	if (!questionBox) {
		throw new Error("the composer has no question box")
	}
	return questionBox as unknown as HTMLTextAreaElement
}

// press one key on the question box, as a composition when the test says
async function pressKey(questionBox: HTMLTextAreaElement, key: string, init: KeyboardEventInit = {}): Promise<boolean> {
	let isDefaultPrevented = false
	await act(async () => {
		const keyboardEvent = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })
		questionBox.dispatchEvent(keyboardEvent as unknown as Event)
		isDefaultPrevented = keyboardEvent.defaultPrevented
		await new Promise((resolve) => setTimeout(resolve, 5))
	})
	return isDefaultPrevented
}

// the accept button, or null while none shows
function toAcceptButton(harness: HookTestHarness<string>): HTMLButtonElement | null {
	return harness.container.querySelector('button[aria-label^="Use suggested reply"]') as unknown as HTMLButtonElement
}

test("the empty box shows the suggestion as its placeholder, on the button's name, announced once", async () => {
	const { harness } = await mountComposer()
	const questionBox = toQuestionBox(harness)
	expect(questionBox.getAttribute("aria-placeholder")).toBe(SUGGESTED_REPLY)
	expect(harness.container.querySelector('span[aria-hidden="true"].truncate')?.textContent).toBe(SUGGESTED_REPLY)
	expect(toAcceptButton(harness)?.getAttribute("aria-label")).toBe(`Use suggested reply: ${SUGGESTED_REPLY}`)
	expect(harness.container.querySelector('[aria-live="polite"]')?.textContent).toBe(
		`Suggested reply: ${SUGGESTED_REPLY}`,
	)
})

test("Right Arrow in the empty box accepts the suggestion with the caret at its end and sends nothing", async () => {
	const { harness, sendCount } = await mountComposer()
	const questionBox = toQuestionBox(harness)
	expect(await pressKey(questionBox, "ArrowRight")).toBe(true)
	expect(questionBox.value).toBe(SUGGESTED_REPLY)
	expect(questionBox.selectionStart).toBe(SUGGESTED_REPLY.length)
	expect(sendCount()).toBe(0)
	expect(toAcceptButton(harness)).toBeNull()
})

test("Tab, a modified Right Arrow, and a composition are left alone", async () => {
	const { harness } = await mountComposer()
	const questionBox = toQuestionBox(harness)
	expect(await pressKey(questionBox, "Tab")).toBe(false)
	expect(await pressKey(questionBox, "ArrowRight", { shiftKey: true })).toBe(false)
	expect(await pressKey(questionBox, "ArrowRight", { isComposing: true })).toBe(false)
	expect(questionBox.value).toBe("")
})

test("Right Arrow in a box with text moves the caret and accepts nothing", async () => {
	// a box holding a letter, which hides the suggestion
	const { harness } = await mountComposer("W")
	const questionBox = toQuestionBox(harness)
	expect(toAcceptButton(harness)).toBeNull()
	expect(await pressKey(questionBox, "ArrowRight")).toBe(false)
	expect(questionBox.value).toBe("W")
})

test("the button accepts by click and sends nothing", async () => {
	const { harness, sendCount } = await mountComposer()
	await act(async () => {
		toAcceptButton(harness)?.click()
		await new Promise((resolve) => setTimeout(resolve, 5))
	})
	expect(toQuestionBox(harness).value).toBe(SUGGESTED_REPLY)
	expect(sendCount()).toBe(0)
})

test("the button is a real button, so Enter and Space press it from the keyboard", async () => {
	const { harness } = await mountComposer()
	const acceptButton = toAcceptButton(harness)
	expect(acceptButton?.tagName).toBe("BUTTON")
	expect(acceptButton?.getAttribute("type")).toBe("button")
})

test("an empty new-topic chat shows an example topic, and a Topic's chat shows its usual line until a suggestion arrives", async () => {
	// the empty new-topic chat
	const { harness: newTopicHarness } = await mountComposer("", {
		page: { newTopic: true },
		chatOverrides: { chatTurns: [], receivedSuggestedReply: null },
	})
	expect(NEW_TOPIC_EXAMPLE_TOPICS).toContain(toQuestionBox(newTopicHarness).getAttribute("aria-placeholder") as never)

	// a Topic's chat with no suggestion yet
	const { harness: topicHarness } = await mountComposer("", { chatOverrides: { receivedSuggestedReply: null } })
	expect(toQuestionBox(topicHarness).placeholder).toBe("Usual line")
	expect(toAcceptButton(topicHarness)).toBeNull()
})

test("a load that turns suggestions off shows the usual line", async () => {
	const { harness } = await mountComposer("", { chatOverrides: { isSuggestedReplyOn: false } })
	expect(toQuestionBox(harness).placeholder).toBe("Usual line")
})

test("a Topic Post page's composer shows a received suggestion, and none with suggestions off", async () => {
	// the composer on a Topic Post's page
	const topicPostPage: ChatPage = {
		topicId: "topic-1",
		topicPost: { id: "post-1", title: "Dialing in", path: "/topics/topic-1/posts/post-1" },
	}
	const { harness } = await mountComposer("", { page: topicPostPage })
	expect(toQuestionBox(harness).getAttribute("aria-placeholder")).toBe(SUGGESTED_REPLY)

	// the same page with the load turning suggestions off
	const { harness: offHarness } = await mountComposer("", {
		page: topicPostPage,
		chatOverrides: { isSuggestedReplyOn: false },
	})
	expect(toAcceptButton(offHarness)).toBeNull()
})
