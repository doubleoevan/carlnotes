import type { ReceivedSuggestedReply } from "@carlnotes/core/hooks/useTopicChat"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { useState } from "react"
import { expect, fn } from "storybook/test"
import { ChatComposer } from "./ChatComposer"
import { toTestChatTurn } from "./chatRoomTestFixtures"
import { toTestReceivedSuggestedReply, toTestTopicChat } from "./topicChatTestFixtures"

// the suggestion a finished chat turn left, and the longest one a composer shows
const SUGGESTED_REPLY = "Weekly is fine"
const LONG_SUGGESTED_REPLY =
	"Keep me up on new espresso machines, grinders, and the people who repair them near me every week"

// the private chat a story's composer writes into, over its own question state, with the given suggestion
function ComposerStory({
	suggestedReply,
	isNewTopicChat,
}: {
	suggestedReply: string | null
	isNewTopicChat?: boolean
}) {
	const [question, setQuestion] = useState("")
	const receivedSuggestedReply: ReceivedSuggestedReply | null = suggestedReply
		? toTestReceivedSuggestedReply({ text: suggestedReply })
		: null
	const chat = toTestTopicChat({
		chatTurns: isNewTopicChat ? [] : [toTestChatTurn()],
		question,
		setQuestion,
		isSuggestedReplyOn: true,
		receivedSuggestedReply,
	})
	return (
		<div className="w-full max-w-md">
			<ChatComposer
				chat={chat}
				onSendQuestion={fn()}
				page={isNewTopicChat ? { newTopic: true } : { topicId: "topic-1" }}
			/>
		</div>
	)
}

const meta = {
	title: "Chat/ChatComposer",
	component: ComposerStory,
	args: { suggestedReply: SUGGESTED_REPLY },
	parameters: { surface: "card" },
} satisfies Meta<typeof ComposerStory>

export default meta
type Story = StoryObj<typeof meta>

// a reply's suggestion as the placeholder, accepted by Right Arrow without sending
export const SuggestedReply: Story = {
	play: async ({ canvas, userEvent }) => {
		const questionBox = canvas.getByRole("textbox", { name: "Ask Carl" })
		await expect(questionBox).toHaveAttribute("aria-placeholder", SUGGESTED_REPLY)
		await expect(canvas.getByRole("button", { name: `Use suggested reply: ${SUGGESTED_REPLY}` })).toBeVisible()
		await userEvent.click(questionBox)
		await userEvent.keyboard("{ArrowRight}")
		await expect(questionBox).toHaveValue(SUGGESTED_REPLY)
	},
}

// the same suggestion in the dark theme
export const SuggestedReplyDark: Story = { globals: { theme: "dark" } }

// the longest suggestion keeps the box one line tall, cut with an ellipsis
export const LongSuggestedReply: Story = { args: { suggestedReply: LONG_SUGGESTED_REPLY } }

// an empty new-topic chat's example topic
export const ExampleTopic: Story = { args: { suggestedReply: null, isNewTopicChat: true } }

// an empty new-topic chat's example topic in the dark theme
export const ExampleTopicDark: Story = {
	args: { suggestedReply: null, isNewTopicChat: true },
	globals: { theme: "dark" },
}

// no suggestion: the private chat's usual line and no accept button
export const NoSuggestion: Story = {
	args: { suggestedReply: null },
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("button", { name: /Use suggested reply/ })).toBeNull()
	},
}
