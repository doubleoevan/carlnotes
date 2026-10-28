import { CHAT_STORY_NOW, CHAT_STORY_VIDEO_PREVIEW, toStoryRoomMessage } from "@carlnotes/core/lib/chatStoryFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, userEvent, within } from "storybook/test"
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
export const VideoLink: Story = {
	args: {
		chatMessage: toStoryRoomMessage({
			content: CHAT_STORY_VIDEO_PREVIEW.url,
			linkPreviews: [CHAT_STORY_VIDEO_PREVIEW],
		}),
	},
}
export const DeleteConfirmation: Story = {
	args: { onDeleteChatMessage: fn() },
	play: async ({ canvas, canvasElement, args }) => {
		// opening and cancelling never deletes the message
		const page = within(canvasElement.ownerDocument.body)
		await userEvent.click(canvas.getByRole("button", { name: "Delete message" }))
		const confirmation = within(await page.findByRole("dialog", { name: "Delete this message?" }))
		await expect(args.onDeleteChatMessage).not.toHaveBeenCalled()
		await userEvent.click(confirmation.getByRole("button", { name: "Keep it" }))
		await expect(args.onDeleteChatMessage).not.toHaveBeenCalled()
		await expect(canvas.getByText(args.chatMessage.content)).toBeInTheDocument()

		// reopening still requires confirmation and sends only the selected message id
		await userEvent.click(canvas.getByRole("button", { name: "Delete message" }))
		const reopenedConfirmation = within(await page.findByRole("dialog", { name: "Delete this message?" }))
		await userEvent.click(reopenedConfirmation.getByRole("button", { name: "Delete message" }))
		await expect(args.onDeleteChatMessage).toHaveBeenCalledOnce()
		await expect(args.onDeleteChatMessage).toHaveBeenCalledWith(args.chatMessage.id)
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
export const OtherMember: Story = {
	args: { isOwnChatMessage: false, canDelete: false },
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("button", { name: "Delete message" })).not.toBeInTheDocument()
	},
}
export const LeaderModeration: Story = { args: { isOwnChatMessage: false, canDelete: true } }
export const AttachmentChips: Story = {
	args: {
		chatMessage: toStoryRoomMessage({ attachments: [{ id: "story-file", name: "Research.pdf", kind: "document" }] }),
	},
}
