// the update count badge: one count summing chat mentions, note changes, and topic invitations, with a tooltip listing
// each group, and the page badge that reads the same counts from the chat room and note badge stores
import type { ChatMention, ChatRoom } from "@carlnotes/contracts/chat"
import type { TopicInviteBadge } from "@carlnotes/contracts/invites"
import type { NoteBadge } from "@carlnotes/contracts/notes"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { STORY_PEOPLE, toStoryProfile } from "../../../.storybook/fixtures"
import { seedBadgeStores } from "../../../.storybook/fixtures/waitingUpdates"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { PageUpdateCountBadge, UpdateCountBadge } from "./UpdateCountBadge"

// the topic and the team every fixture sits on
const TOPIC_ID = "topic-llm-tooling"
const TEAM_ID = "team-reading-club"

// two chat mentions in the topic's chat room, one of them a reply
const CHAT_MENTIONS: ChatMention[] = [
	{
		teamId: TEAM_ID,
		chatMessageId: 101,
		authorUsername: "carlos",
		isReply: false,
		excerpt: "@vienna have you tried the new eval runner?",
	},
	{
		teamId: TEAM_ID,
		chatMessageId: 102,
		authorUsername: "evan",
		isReply: true,
		excerpt: "Agreed, the tracing view saves an hour a week.",
	},
]

// one note on the topic with an edit and two comments, and one on the team's page with a comment
const NOTE_BADGES: NoteBadge[] = [
	{
		noteId: "note-eval-checklist",
		topicId: TOPIC_ID,
		teamId: null,
		teamIds: [TEAM_ID],
		noteName: "Eval checklist",
		pageName: "LLM tooling",
		unreadEdits: 1,
		unreadComments: 2,
	},
	{
		noteId: "note-reading-list",
		topicId: null,
		teamId: TEAM_ID,
		teamIds: [TEAM_ID],
		noteName: "Reading list",
		pageName: "Reading Club",
		unreadEdits: 0,
		unreadComments: 1,
	},
]

// one invitation to subscribe to a topic
const TOPIC_INVITES: TopicInviteBadge[] = [
	{ inviteId: "invite-rust", topicId: "topic-rust", topicName: "Rust in production", inviterUsername: "carlos" },
]

// twelve chat mentions, more than the count and the tooltip show
const MANY_CHAT_MENTIONS: ChatMention[] = Array.from({ length: 12 }, (_, index) => ({
	teamId: TEAM_ID,
	chatMessageId: 200 + index,
	authorUsername: index % 2 === 0 ? "carlos" : "evan",
	isReply: index % 3 === 0,
	excerpt: `Question ${index + 1} about the eval runner`,
}))

// the topic's chat room as the chat panel last read it, holding the two chat mentions
const TOPIC_CHAT_ROOM: ChatRoom = {
	teamId: TEAM_ID,
	topicId: TOPIC_ID,
	name: "LLM tooling",
	teamName: "Reading Club",
	teamAvatarVersion: null,
	chatMentions: CHAT_MENTIONS,
	chatRoomMembers: STORY_PEOPLE.map(toStoryProfile),
}

const meta = {
	title: "Common/UpdateCountBadge",
	component: UpdateCountBadge,
	// the count at the size the user menu, the profile avatar, and the chat pill give it
	args: {
		chatMentions: CHAT_MENTIONS,
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
export const NoteChanges: Story = { args: { chatMentions: [], noteBadges: NOTE_BADGES } }

// a topic invitation, at the count's own size as the activity page's title shows it
export const TopicInvites: Story = {
	args: { chatMentions: [], invites: TOPIC_INVITES, countBadgeClassName: undefined },
}

// every group at once, as the user menu's trigger sums them, with the tooltip open listing each group
export const AllUpdates: Story = {
	args: { noteBadges: NOTE_BADGES, invites: TOPIC_INVITES },
	play: async ({ canvas, userEvent }) => {
		await userEvent.hover(canvas.getByRole("status"))
	},
}

// more updates than the badge counts, which reads 9+, and a tooltip that folds the rest into a count
export const Overflow: Story = {
	args: { chatMentions: MANY_CHAT_MENTIONS },
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
	beforeEach: () => seedBadgeStores({ chatRooms: [TOPIC_CHAT_ROOM], noteBadges: NOTE_BADGES }),
	render: () => (
		<span className="font-display relative text-2xl">
			LLM tooling
			<PageUpdateCountBadge topicId={TOPIC_ID} />
		</span>
	),
}
