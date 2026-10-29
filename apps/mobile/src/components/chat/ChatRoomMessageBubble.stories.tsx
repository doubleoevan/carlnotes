import { CHAT_STORY_NOW, CHAT_STORY_VIDEO_PREVIEW, toStoryRoomMessage } from "@carlnotes/core/lib/chatStoryFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { useState } from "react"
import { Text } from "@/components/primitives/text"
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
	parameters: { webReference: "apps/web/src/components/chat/ChatRoomMessageBubble.tsx", surface: "card" },
}
export default meta
type Story = StoryObj<typeof meta>
// rendered component states
export const OwnMessage: Story = {}
export const VideoLink: Story = {
	args: {
		chatMessage: toStoryRoomMessage({
			content: CHAT_STORY_VIDEO_PREVIEW.url,
			linkPreviews: [CHAT_STORY_VIDEO_PREVIEW],
		}),
	},
}
export const DeleteConfirmation: Story = {
	render: function DeleteConfirmationStory(args) {
		const [isDeleted, setIsDeleted] = useState(false)
		return isDeleted ? (
			<Text>Message deleted.</Text>
		) : (
			<ChatRoomMessageBubble {...args} onDeleteChatMessage={() => setIsDeleted(true)} />
		)
	},
}
// another member's message with its Report action
export const Reportable: Story = { args: { isOwnChatMessage: false, canDelete: false, onReport: () => {} } }
// a reply to a message the user cannot see, with a hidden quote in its place
export const HiddenQuote: Story = {
	args: {
		chatMessage: toStoryRoomMessage({ replyToChatMessageId: 1 }),
		repliedChatMessage: null,
		isOwnChatMessage: false,
		canDelete: false,
	},
}
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
