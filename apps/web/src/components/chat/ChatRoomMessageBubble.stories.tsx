import { CHAT_STORY_NOW, toStoryRoomMessage } from "@carlnotes/core/lib/chatStoryFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { ChatRoomMessageBubble } from "./ChatRoomMessageBubble"

// the component fixture and preview layout
const meta: Meta<typeof ChatRoomMessageBubble> = {
	title: "Chat/ChatRoomMessageBubble",
	component: ChatRoomMessageBubble,
	args: {
		chatMessage: toStoryRoomMessage(),
		topicId: "story-topic",
		teamId: "story-team",
		now: CHAT_STORY_NOW,
		isOwnChatMessage: true,
		canDelete: true,
		isLinkPreviewLoading: false,
		voiceChatPage: null,
		onReply: () => {},
		onQuoteClick: () => {},
		onAttachmentDelete: () => {},
		onDeleteChatMessage: () => {},
	},
	parameters: { surface: "card" },
}
export default meta
type Story = StoryObj<typeof meta>
// rendered component states
export const OwnMessage: Story = {}
export const MentionAndReply: Story = {
	args: {
		chatMessage: toStoryRoomMessage({
			content: "@reader, try the smaller batch.",
			authorUserId: null,
			authorUsername: "Carl",
			replyToChatMessageId: 1,
		}),
		repliedChatMessage: toStoryRoomMessage({ id: 1 }),
		isOwnChatMessage: false,
		canDelete: false,
	},
}
export const OtherMember: Story = { args: { isOwnChatMessage: false, canDelete: false } }
export const LeaderModeration: Story = { args: { isOwnChatMessage: false, canDelete: true } }
export const AttachmentChips: Story = {
	args: {
		chatMessage: toStoryRoomMessage({ attachments: [{ id: "story-file", name: "Research.pdf", kind: "document" }] }),
	},
}
