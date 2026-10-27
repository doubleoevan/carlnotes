import { CHAT_STORY_AUTHOR, CHAT_STORY_NOW, toStoryChatTurn } from "@carlnotes/core/lib/chatStoryFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { ScrollView } from "react-native"
import { ChatTurnBlock } from "./ChatTurnBlock"

// the component fixture and preview layout
const meta: Meta<typeof ChatTurnBlock> = {
	title: "Chat/ChatTurnBlock",
	component: ChatTurnBlock,
	args: {
		chatTurn: toStoryChatTurn(),
		index: 0,
		uncompactedChatTurnStart: 0,
		isLast: true,
		isStreaming: false,
		now: CHAT_STORY_NOW,
		author: CHAT_STORY_AUTHOR,
		voiceChatPage: null,
	},
	parameters: { webReference: "apps/web/src/components/chat/ChatTurnBlock.tsx", surface: "card" },
	decorators: [
		(Story) => (
			<ScrollView style={{ width: "100%" }}>
				<Story />
			</ScrollView>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
// rendered component states
export const Finished: Story = {}
export const Waiting: Story = { args: { chatTurn: toStoryChatTurn({ answer: "" }), isStreaming: true } }
export const ToolOnly: Story = {
	args: {
		chatTurn: toStoryChatTurn({
			answer: "",
			toolCalls: [{ toolName: "readTopic", input: {}, output: "Read the topic." }],
		}),
	},
}
export const Attachments: Story = {
	args: {
		chatTurn: toStoryChatTurn({ attachments: [{ id: "story-file", name: "Reading notes.pdf", kind: "document" }] }),
	},
}
export const Failed: Story = {
	args: { chatTurn: toStoryChatTurn({ rejection: "failed", answer: "" }), onRetry: () => {} },
}
