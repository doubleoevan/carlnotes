// the teams table's rows: a membership with its members and topics subtables, and an invitation waiting for an answer
import { sendAcceptInvite, sendDeclineInvite } from "@carlnotes/client/activityClient"
import { fetchTeamPage } from "@carlnotes/client/teamClient"
import type { Topic } from "@carlnotes/contracts/profiles"
import type { TeamPageResponse, TeamSummary } from "@carlnotes/contracts/teams"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn, mocked } from "storybook/test"
import { STORY_PEOPLE, toStoryProfile } from "../../../.storybook/fixtures"
import {
	STORY_TEAMS,
	toStoryTeamMember,
	toStoryTeamPage,
	toStoryTeamRowFields,
} from "../../../.storybook/fixtures/teams"
import { toStoryTopic } from "../../../.storybook/fixtures/topics"
import { seedBadgeStores } from "../../../.storybook/fixtures/waitingUpdates"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { StoryTable } from "../../../.storybook/tableDecorators"
import type { RowSort } from "./SortableHeader"
import { type ReceivedInvite, TeamInviteRow, TeamMembershipRow } from "./TeamMembershipRows"
import { TeamsMembershipTableHead } from "./TeamsMembershipTable"

// the invented people on the team: Vienna, the signed-in user, then Carlos and Evan
const [VIENNA, CARLOS, EVAN] = STORY_PEOPLE

// the sort the teams table starts with, by team name. a header click changes nothing in a story about one row
const TEAM_NAME_SORT: RowSort = { sortKey: "team", isDescending: false, toggleSort: () => {} }

// an invitation from Evan to a public team
const BATTERY_READERS_INVITE: ReceivedInvite = {
	...STORY_TEAMS.batteryReaders,
	isPublic: true,
	memberCount: 5,
	topicCount: 3,
	scanSpendCents: 230,
	chatSpendCents: 40,
	inviteId: "invite-battery-readers",
	sender: toStoryProfile(EVAN),
	invitedAt: "2026-09-25T12:00:00.000Z",
}

// the topics the team holds, for the topics subtable
const MODEL_WATCHERS_TOPICS: Topic[] = [
	toStoryTopic({
		id: "topic-llm-tooling",
		name: "LLM tooling",
		createdAt: "2026-06-02T12:00:00.000Z",
		keptCount: 48,
		seenCount: 310,
		subscriberCount: 12,
		isEmailEnabled: true,
	}),
	toStoryTopic({
		id: "topic-eval-harnesses",
		name: "Evaluation harnesses",
		visibility: "invite",
		createdAt: "2026-07-14T12:00:00.000Z",
		updatedAt: "2026-09-29T12:00:00.000Z",
		keptCount: 17,
		seenCount: 142,
		subscriberCount: 4,
		isEmailEnabled: false,
	}),
]

// the team page payload that fills a row's subtables
const MODEL_WATCHERS_PAGE: TeamPageResponse = toStoryTeamPage({
	...STORY_TEAMS.modelWatchers,
	isPublic: true,
	role: "member",
	members: [
		toStoryTeamMember(VIENNA),
		toStoryTeamMember(CARLOS, { role: "leader" }),
		toStoryTeamMember(EVAN, { isMemberVisible: false }),
	],
	topics: MODEL_WATCHERS_TOPICS,
})

// a team Vienna belongs to, invited by Carlos, as the teams page sends it, counted from its team page
const MODEL_WATCHERS: TeamSummary = {
	...toStoryTeamRowFields(MODEL_WATCHERS_PAGE, { scanSpendCents: 412, chatSpendCents: 86 }),
	role: "member",
	isOnlyLeader: false,
	invitedBy: toStoryProfile(CARLOS),
	chatMentions: [],
}

const meta = {
	title: "Table/TeamMembershipRows",
	component: TeamMembershipRow,
	subcomponents: { TeamInviteRow },
	args: { team: MODEL_WATCHERS, isReadOnly: false, onLeave: fn(), onDelete: fn() },
	argTypes: {
		team: { control: "object" },
		isReadOnly: { control: "boolean" },
		onLeave: { control: false },
		onDelete: { control: false },
	},
	parameters: { session: "user" },
	// a row renders in the teams table's body, under its column headers
	decorators: [
		(Story, { args }) => (
			<StoryTable
				className="min-w-3xl"
				head={<TeamsMembershipTableHead sort={TEAM_NAME_SORT} isReadOnly={args.isReadOnly ?? false} />}
			>
				<Story />
			</StoryTable>
		),
	],
	// the subtables load the team page, and answering an invitation succeeds, all without a request
	beforeEach: () => {
		mocked(fetchTeamPage).mockResolvedValue({ status: "visible", team: MODEL_WATCHERS_PAGE })
		mocked(sendAcceptInvite).mockResolvedValue({
			status: "joinedTeam",
			teamId: BATTERY_READERS_INVITE.teamId,
			teamName: BATTERY_READERS_INVITE.name,
		})
		mocked(sendDeclineInvite).mockResolvedValue(undefined)
	},
} satisfies Meta<typeof TeamMembershipRow>

export default meta
type Story = StoryObj<typeof meta>
type InviteStory = StoryObj<typeof TeamInviteRow>

// a team the user joined on an invitation, its long description truncated
export const Member: Story = {}

// a team the user leads and created, with the delete button and the user's own profile as Invited by
export const Leader: Story = { args: { team: { ...MODEL_WATCHERS, role: "leader", invitedBy: null } } }

// the team's only leader, whose faded switch opens the members to choose a new leader
export const OnlyLeader: Story = {
	args: { team: { ...MODEL_WATCHERS, role: "leader", isOnlyLeader: true, invitedBy: null } },
}

// the row on someone else's profile, without Invited by, spend, or membership controls
export const ReadOnly: Story = { args: { isReadOnly: true } }

// an unread mention in the team's chat room, badged on the team's name
export const WithChatMention: Story = {
	// every story shares the badge stores, so the docs page gives this story its own frame to keep its seed from the rest
	parameters: { docs: toOwnFrameDocs(176) },
	// seed the team chat room with Carlos's mention of Vienna, and empty the store afterwards
	beforeEach: () =>
		seedBadgeStores({
			chatRooms: [
				{
					teamId: MODEL_WATCHERS.teamId,
					topicId: null,
					name: MODEL_WATCHERS.name,
					teamName: MODEL_WATCHERS.name,
					teamAvatarVersion: null,
					chatMentions: [
						{
							teamId: MODEL_WATCHERS.teamId,
							chatMessageId: 1,
							authorUsername: CARLOS.username,
							isReply: false,
							excerpt: "@vienna the eval harness notes are up for review",
						},
					],
					chatRoomMembers: [toStoryProfile(VIENNA), toStoryProfile(CARLOS)],
				},
			],
		}),
}

// the members subtable open under the row, after a click on the members count
export const MembersOpen: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /^Show Model Watchers's members, \d+$/ }))
		await canvas.findByText(EVAN.username)
	},
}

// the topics subtable open under the row, after a click on the topics count
export const TopicsOpen: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /^Show Model Watchers's topics, \d+$/ }))
		await canvas.findByText("Evaluation harnesses")
	},
}

// an invitation to a public team, its name linking to the team page, waiting for the user's answer
export const PublicInvite: InviteStory = {
	args: { invite: BATTERY_READERS_INVITE, onAnswered: fn() },
	render: (args) => <TeamInviteRow {...args} />,
}

// an invitation to a private team with no description, from a sender whose account has closed
export const PrivateInvite: InviteStory = {
	args: {
		invite: { ...BATTERY_READERS_INVITE, isPublic: false, description: null, sender: null },
		onAnswered: fn(),
	},
	render: (args) => <TeamInviteRow {...args} />,
}
