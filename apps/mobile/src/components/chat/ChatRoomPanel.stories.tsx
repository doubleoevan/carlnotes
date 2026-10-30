import type { ChatRoomState } from "@carlnotes/core/hooks/useChatRoom"
import { useRoomReply } from "@carlnotes/core/hooks/useRoomReply"
import { CHAT_STORY_DRAFT, toStoryRoomMessage } from "@carlnotes/core/lib/chatStoryFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { ChoiceSelect } from "@/components/common/ChoiceSelect"
import { Text } from "@/components/primitives/text"
import { ChatPanelWidget } from "./ChatPanelWidget"
import { ChatRoomContent } from "./ChatRoomPanel"

// local fixtures exercise the real room presentation without sending a request
const chatRoom: ChatRoomState = {
	chatMessages: [],
	isLoaded: true,
	isRejected: false,
	hasLoadFailed: false,
	reloadUnreadableRoom: null,
	hasMessagePageLoadFailed: false,
	voiceChatPage: null,
	rejection: null,
	clearRejection: () => {},
	showBudgetRejection: () => {},
	isMessageLoading: false,
	postChatMessage: async () => false,
	loadEarlierChatMessages: async () => 0,
	hasEarlierChatMessages: false,
	firstItemIndex: 1000000,
	reloadChatMessages: async () => {},
	loadingChatMessageIds: new Set(),
}
// the component fixture and preview layout
const meta: Meta<typeof RoomStory> = {
	title: "Chat/ChatRoomPanel",
	component: RoomStory,
	args: { state: chatRoom },
	decorators: [
		(Story) => (
			<ChatPanelWidget onClose={() => {}}>
				<View className="gap-2 px-3 pb-2">
					<Text className="text-sm text-muted-foreground">Coffee Club</Text>
					<ChoiceSelect
						label="Choose conversation"
						presentation="sheet"
						value="room"
						onChange={() => {}}
						options={[{ value: "room", label: "Coffee Club" }]}
					/>
				</View>
				<Story />
			</ChatPanelWidget>
		),
	],
	parameters: { webReference: "apps/web/src/components/chat/ChatRoomPanel.tsx", surface: "card" },
}
export default meta
type Story = StoryObj<typeof meta>
// rendered component states
export const Empty: Story = {}
export const Loading: Story = { args: { state: { ...chatRoom, isLoaded: false } } }
export const FailedRead: Story = { args: { state: { ...chatRoom, isLoaded: false, hasLoadFailed: true } } }
export const UnreadableRoom: Story = {
	args: { state: { ...chatRoom, isLoaded: false, reloadUnreadableRoom: () => {} } },
}
export const RefreshFailed: Story = {
	args: { state: { ...chatRoom, chatMessages: [toStoryRoomMessage()], hasMessagePageLoadFailed: true } },
}
export const NoAccess: Story = { args: { state: { ...chatRoom, isRejected: true } } }
export const WaitingForCarl: Story = {
	args: { state: { ...chatRoom, chatMessages: [toStoryRoomMessage()], isMessageLoading: true } },
}
export const RejectedPost: Story = { args: { state: { ...chatRoom, rejection: "budget" } } }
export const ProposedTopicEdit: Story = { args: { hasTopicDraft: true } }
export const MentionAndReply: Story = {
	args: {
		state: {
			...chatRoom,
			chatMessages: [
				toStoryRoomMessage({ id: 1 }),
				toStoryRoomMessage({
					id: 2,
					authorUserId: null,
					authorUsername: "Carl",
					content: "@reader, try a smaller batch.",
					replyToChatMessageId: 1,
				}),
			],
		},
	},
}
export const AttachmentChips: Story = {
	args: {
		state: {
			...chatRoom,
			chatMessages: [toStoryRoomMessage({ attachments: [{ id: "fixture", name: "Research.pdf", kind: "document" }] })],
		},
	},
}

// share reply selection with the real panel while keeping rejected posts available for composer checks
function RoomStory({ state: chatRoomState, hasTopicDraft = false }: { state: ChatRoomState; hasTopicDraft?: boolean }) {
	const chatRoomReply = useRoomReply(chatRoomState, "story-reader")
	return (
		<ChatRoomContent
			room={chatRoomState}
			reply={chatRoomReply}
			draft={hasTopicDraft ? { topicDraft: CHAT_STORY_DRAFT, isTopicEditProposed: true } : null}
			topicId="story-topic"
			teamId="story-team"
			userId="story-reader"
			name="Coffee Club"
			canModerate
			memberUsernames={["reader", "friend"]}
			onDelete={async () => {}}
			onAttachmentDelete={() => {}}
			onClear={async () => false}
		/>
	)
}
