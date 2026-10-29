// the update count badge: one count summing chat mentions, note changes, and topic invitations, with a tooltip listing
// each group, and the page badge that reads the same counts from the chat room and note badge stores
import {
	UPDATE_STORY_CHAT_MENTIONS,
	UPDATE_STORY_MANY_CHAT_MENTIONS,
	UPDATE_STORY_NOTE_BADGES,
	UPDATE_STORY_TOPIC_CHAT_ROOM,
	UPDATE_STORY_TOPIC_ID,
	UPDATE_STORY_TOPIC_INVITES,
} from "@carlnotes/core/lib/updateCountStoryFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { STORY_PEOPLE, toStoryProfile } from "../../../.storybook/fixtures"
import { seedBadgeStores } from "../../../.storybook/fixtures/waitingUpdates"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { PageUpdateCountBadge, UpdateCountBadge } from "./UpdateCountBadge"

// the topic's chat room as the chat panel last read it, with the story people as its members
const TOPIC_CHAT_ROOM = { ...UPDATE_STORY_TOPIC_CHAT_ROOM, chatRoomMembers: STORY_PEOPLE.map(toStoryProfile) }

const meta = {
	title: "Common/UpdateCountBadge",
	component: UpdateCountBadge,
	// the count at the size the user menu, the profile avatar, and the chat pill give it
	args: {
		chatMentions: UPDATE_STORY_CHAT_MENTIONS,
		countBadgeClassName: "h-5 min-w-5 text-xs",
		onClick: fn(),
		onMouseEnter: fn(),
	},
	argTypes: {
		chatMentions: { control: "object" },
		noteBadges: { control: "object" },
		invites: { control: "object" },
		href: { control: "text" },
		className: { control: "text" },
		countBadgeClassName: { control: "text" },
		onClick: { control: false },
		onMouseEnter: { control: false },
	},
	// the badge sits in a corner or a flex row in the app, so the story centers it at its own size
	parameters: { layout: "centered" },
} satisfies Meta<typeof UpdateCountBadge>

export default meta
type Story = StoryObj<typeof meta>

// two chat mentions, as a status with no link
export const ChatMentions: Story = {}

// note changes, an edit and comments summed into one count
export const NoteChanges: Story = { args: { chatMentions: [], noteBadges: UPDATE_STORY_NOTE_BADGES } }

// a topic invitation, at the count's own size as the activity page's title shows it
export const TopicInvites: Story = {
	args: { chatMentions: [], invites: UPDATE_STORY_TOPIC_INVITES, countBadgeClassName: undefined },
}

// every group at once, as the user menu's trigger sums them, with the tooltip open listing each group
export const AllUpdates: Story = {
	args: { noteBadges: UPDATE_STORY_NOTE_BADGES, invites: UPDATE_STORY_TOPIC_INVITES },
	play: async ({ canvas, userEvent }) => {
		await userEvent.hover(canvas.getByRole("status"))
	},
}

// more updates than the badge counts, which reads 9+, and a tooltip that folds the rest into a count
export const Overflow: Story = {
	args: { chatMentions: UPDATE_STORY_MANY_CHAT_MENTIONS },
	play: async ({ canvas, userEvent }) => {
		await userEvent.hover(canvas.getByRole("status"))
	},
}

// nothing waiting, which renders nothing
export const NothingWaiting: Story = { args: { chatMentions: [] } }

// the page badge at a topic name's corner, read from the chat room and note badge stores
export const OnTopicPage: Story = {
	// every story shares the badge stores, so the docs page gives this story its own frame to keep its seed from the rest
	parameters: { docs: toOwnFrameDocs(64) },
	// seed the chat room and note badge stores, and empty them again after the story
	beforeEach: () => seedBadgeStores({ chatRooms: [TOPIC_CHAT_ROOM], noteBadges: UPDATE_STORY_NOTE_BADGES }),
	render: () => (
		<span className="font-display relative text-2xl">
			LLM tooling
			<PageUpdateCountBadge topicId={UPDATE_STORY_TOPIC_ID} />
		</span>
	),
}
