// the update count badge: one count summing chat mentions, note changes, and topic invitations, a long press listing
// each group, and the page badge that reads the same counts from the chat room and note badge stores
import {
	UPDATE_STORY_CHAT_MENTIONS,
	UPDATE_STORY_MANY_CHAT_MENTIONS,
	UPDATE_STORY_NOTE_BADGES,
	UPDATE_STORY_TOPIC_CHAT_ROOM,
	UPDATE_STORY_TOPIC_ID,
	UPDATE_STORY_TOPIC_INVITES,
} from "@carlnotes/core/lib/updateCountStoryFixtures"
import { resetChatRooms, setChatRooms } from "@carlnotes/core/stores/chatRoomStore"
import { resetNoteBadges, setNoteBadges } from "@carlnotes/core/stores/noteBadgeStore"
import type { Meta, StoryObj } from "@storybook/react-native"
import { useEffect } from "react"
import { Text as NativeText, View } from "react-native"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { PageUpdateCountBadge, UpdateCountBadge } from "./UpdateCountBadge"

// the component fixture and preview layout, the count at the size the menu and the chat pill give it
const meta: Meta<typeof UpdateCountBadge> = {
	title: "Common/UpdateCountBadge",
	component: UpdateCountBadge,
	args: { chatMentions: UPDATE_STORY_CHAT_MENTIONS, countBadgeClassName: "text-xs" },
	argTypes: {
		chatMentions: { control: "object" },
		noteBadges: { control: "object" },
		invites: { control: "object" },
		className: { control: "text" },
		countBadgeClassName: { control: "text" },
	},
	decorators: [
		(Story) => (
			<View className="w-full items-center py-6">
				<Story />
			</View>
		),
	],
	parameters: { webReference: "apps/web/src/components/common/UpdateCountBadge.tsx" },
}
export default meta
type Story = StoryObj<typeof meta>

// two chat mentions. a press opens the sheet
export const ChatMentions: Story = {}

// note changes, an edit and comments summed into one count
export const NoteChanges: Story = { args: { chatMentions: [], noteBadges: UPDATE_STORY_NOTE_BADGES } }

// a topic invitation, at the count's own size as the Activity title shows it
export const TopicInvites: Story = {
	args: { chatMentions: [], invites: UPDATE_STORY_TOPIC_INVITES, countBadgeClassName: undefined },
}

// every group at once, as the menu button sums them. a long press lists each group under its heading
export const AllUpdates: Story = {
	args: { noteBadges: UPDATE_STORY_NOTE_BADGES, invites: UPDATE_STORY_TOPIC_INVITES },
}

// more updates than the badge counts, which reads 9+, and a sheet that folds the rest into a count
export const Overflow: Story = { args: { chatMentions: UPDATE_STORY_MANY_CHAT_MENTIONS } }

// nothing waiting, which renders nothing
export const NothingWaiting: Story = { args: { chatMentions: [] } }

// the menu button's badge, decorative inside the control that reads its count
export const Decorative: Story = { args: { isDecorative: true, className: "absolute -top-0.5 -right-0.5" } }

// the page badge beside a topic name, read from the chat room and note badge stores
export const OnTopicPage: Story = {
	render: () => (
		<SeededStores>
			<View className="flex-row items-center gap-2">
				<NativeText style={toTypeRoleStyle("pageTitle")} className="text-foreground">
					LLM tooling
				</NativeText>
				<PageUpdateCountBadge topicId={UPDATE_STORY_TOPIC_ID} />
			</View>
		</SeededStores>
	),
}

// seed the chat room and note badge stores for the story, and empty them again after it
function SeededStores({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		resetNoteBadges("story-account")
		setChatRooms([UPDATE_STORY_TOPIC_CHAT_ROOM])
		setNoteBadges(UPDATE_STORY_NOTE_BADGES)
		return () => {
			resetChatRooms()
			resetNoteBadges(null)
		}
	}, [])
	return children
}
