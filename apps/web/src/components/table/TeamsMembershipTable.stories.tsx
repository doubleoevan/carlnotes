// the teams table: the user's memberships and the team invitations waiting for an answer, each row opening the
// team's members and topics under it
import { sendAcceptInvite, sendDeclineInvite } from "@carlnotes/client/activityClient"
import {
	fetchTeamPage,
	sendApproveJoinRequest,
	sendRemoveTeamMember,
	sendRemoveTopicFromTeam,
	sendTeamMemberRole,
	setTeamMemberVisibility,
} from "@carlnotes/client/teamClient"
import { fetchTopicPage, sendSubscriptionEmail } from "@carlnotes/client/topicClient"
import type { TeamSummary } from "@carlnotes/contracts/teams"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn, mocked } from "storybook/test"
import { FIXTURE_DATE, STORY_PEOPLE, toStoryProfile } from "../../../.storybook/fixtures"
import {
	STORY_TEAMS,
	toStoryTeamMember,
	toStoryTeamPage,
	toStoryTeamRowFields,
} from "../../../.storybook/fixtures/teams"
import { toStoryTopic } from "../../../.storybook/fixtures/topics"
import { seedBadgeStores } from "../../../.storybook/fixtures/waitingUpdates"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import type { ReceivedInvite } from "./TeamMembershipRows"
import { TeamsMembershipTable } from "./TeamsMembershipTable"

// the invented people on the teams: Vienna, the signed-in user, then Carlos and Evan
const [VIENNA, CARLOS, EVAN] = STORY_PEOPLE

// the team Vienna leads alone
const designGuildPage = toStoryTeamPage({
	...STORY_TEAMS.designGuild,
	isPublic: true,
	role: "leader",
	members: [toStoryTeamMember(VIENNA, { role: "leader" }), toStoryTeamMember(CARLOS), toStoryTeamMember(EVAN)],
	topics: [
		toStoryTopic({ id: "topic-llm-tooling", name: "LLM tooling" }),
		toStoryTopic({ id: "topic-design-systems", name: "Design systems" }),
	],
})

// the private team Carlos invited Vienna onto, with a description long enough to truncate
const readingCirclePage = toStoryTeamPage({
	teamId: "team-reading-circle",
	name: "Reading Circle",
	description:
		"Long reads on climate policy and the energy grid, picked every week and argued over in the team chat on Fridays.",
	isPublic: false,
	role: "member",
	members: [toStoryTeamMember(CARLOS, { role: "leader" }), toStoryTeamMember(VIENNA), toStoryTeamMember(EVAN)],
	topics: [
		toStoryTopic({ id: "topic-climate-policy", name: "Climate policy" }),
		toStoryTopic({ id: "topic-energy-grid", name: "Energy grid" }),
		toStoryTopic({ id: "topic-battery-chemistry", name: "Battery chemistry" }),
	],
})

// the team Evan invited Vienna to join, with no description
const espressoClubPage = toStoryTeamPage({
	teamId: "team-espresso-club",
	name: "Espresso Club",
	description: null,
	isPublic: true,
	role: null,
	members: [toStoryTeamMember(EVAN, { role: "leader" }), toStoryTeamMember(CARLOS)],
	topics: [toStoryTopic({ id: "topic-home-espresso", name: "Home espresso" })],
})

// Vienna's membership of the team Vienna leads alone, so the leave switch opens the members instead
const designGuildMembership: TeamSummary = {
	...toStoryTeamRowFields(designGuildPage, { scanSpendCents: 412, chatSpendCents: 96 }),
	role: "leader",
	isOnlyLeader: true,
	invitedBy: null,
	chatMentions: [],
}

// Vienna's membership of the team Carlos invited Vienna onto
const readingCircleMembership: TeamSummary = {
	...toStoryTeamRowFields(readingCirclePage, { scanSpendCents: 1290, chatSpendCents: 310 }),
	role: "member",
	isOnlyLeader: false,
	invitedBy: toStoryProfile(CARLOS),
	chatMentions: [],
}

// Evan's invitation for Vienna to join the Espresso Club
const espressoClubInvite: ReceivedInvite = {
	...toStoryTeamRowFields(espressoClubPage, { scanSpendCents: 150, chatSpendCents: 20 }),
	inviteId: "invite-espresso-club",
	sender: toStoryProfile(EVAN),
	invitedAt: FIXTURE_DATE.toISOString(),
}

// the names of twelve more teams Vienna belongs to, enough for a second page at ten rows a page
const PAGED_TEAM_NAMES = [
	"Accessibility Crew",
	"Bike Commuters",
	"City Gardeners",
	"Climbing Partners",
	"Data Viz Circle",
	"Eval Builders",
	"Home Bakers",
	"Podcast Club",
	"Robot Tinkerers",
	"Sourdough Society",
	"Tax Nerds",
	"Trail Runners",
]

// the twelve teams' pages, each led by Carlos with Vienna as a member and no topics
const pagedTeamPages = PAGED_TEAM_NAMES.map((teamName, i) =>
	toStoryTeamPage({
		teamId: `team-paged-${i + 1}`,
		name: teamName,
		description: null,
		isPublic: i % 3 !== 0,
		role: "member",
		members: [toStoryTeamMember(CARLOS, { role: "leader" }), toStoryTeamMember(VIENNA)],
		topics: [],
	}),
)

// Vienna's membership of each of the twelve teams, each one from Carlos's invitation
const pagedMemberships: TeamSummary[] = pagedTeamPages.map((teamPage, i) => ({
	...toStoryTeamRowFields(teamPage, { scanSpendCents: i * 37, chatSpendCents: i * 11 }),
	role: "member",
	isOnlyLeader: false,
	invitedBy: toStoryProfile(CARLOS),
	chatMentions: [],
}))

// every team page a row's subtables can load
const STORY_TEAM_PAGES = [designGuildPage, readingCirclePage, espressoClubPage, ...pagedTeamPages]

const meta = {
	title: "Table/TeamsMembershipTable",
	component: TeamsMembershipTable,
	args: {
		teams: [designGuildMembership, readingCircleMembership],
		receivedInvites: [espressoClubInvite],
		isReadOnly: false,
		onLeave: fn(),
		onDelete: fn(),
		onAnswered: fn(),
	},
	argTypes: {
		teams: { control: "object" },
		receivedInvites: { control: "object" },
		isReadOnly: { control: "boolean" },
		onLeave: { control: false },
		onDelete: { control: false },
		onAnswered: { control: false },
	},
	parameters: { session: "user" },
	beforeEach: () => {
		// a row's subtables load the team page its team id names
		mocked(fetchTeamPage).mockImplementation(async (teamId) => {
			const storyTeamPage = STORY_TEAM_PAGES.find((teamPage) => teamPage.teamId === teamId)
			return storyTeamPage ? { status: "visible", team: storyTeamPage } : { status: "missing" }
		})

		// answering an invitation, and every control inside an open subtable, resolve without a request
		mocked(sendAcceptInvite).mockResolvedValue({
			status: "joinedTeam",
			teamId: espressoClubInvite.teamId,
			teamName: espressoClubInvite.name,
		})
		mocked(sendDeclineInvite).mockResolvedValue(undefined)
		mocked(sendRemoveTopicFromTeam).mockResolvedValue(true)
		mocked(sendTeamMemberRole).mockResolvedValue(true)
		mocked(sendRemoveTeamMember).mockResolvedValue(true)
		mocked(sendApproveJoinRequest).mockResolvedValue("joined")
		mocked(setTeamMemberVisibility).mockResolvedValue(undefined)
		mocked(sendSubscriptionEmail).mockResolvedValue(undefined)
		mocked(fetchTopicPage).mockResolvedValue({ status: "missing" })
	},
} satisfies Meta<typeof TeamsMembershipTable>

export default meta
type Story = StoryObj<typeof meta>

// two memberships and one invitation waiting for an answer, as Vienna's own teams page shows them
export const Default: Story = {}

// a chat mention waiting in the Design Guild's team chat room, badged on the team's name
export const WithChatMention: Story = {
	// every story shares the badge stores, so the docs page gives this story its own frame to keep its seed from the rest
	parameters: { docs: toOwnFrameDocs(346) },
	// seed the team chat room with Carlos's reply to Vienna, and empty the store afterwards
	beforeEach: () =>
		seedBadgeStores({
			chatRooms: [
				{
					teamId: designGuildPage.teamId,
					topicId: null,
					name: designGuildPage.name,
					teamName: designGuildPage.name,
					teamAvatarVersion: null,
					chatMentions: [
						{
							teamId: designGuildPage.teamId,
							chatMessageId: 17,
							authorUsername: "carlos",
							isReply: true,
							excerpt: "agreed, the design systems topic should scan weekly",
						},
					],
					chatRoomMembers: [],
				},
			],
		}),
}

// the Design Guild row with its members subtable open under it
export const MembersOpen: Story = {
	// open the subtable and wait for the leader's role selects
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /^Show Design Guild's members, \d+$/ }))
		await canvas.findByLabelText("carlos role")
	},
}

// Vienna's teams on Vienna's profile as Laura reads it: no Invited by, spend, or membership controls, and no
// invitations
export const ReadOnly: Story = {
	args: { receivedInvites: [], isReadOnly: true },
	parameters: { session: "admin" },
}

// fourteen memberships and the invitation over two pages, with the pagination footer under the table
export const Paged: Story = {
	args: { teams: [designGuildMembership, readingCircleMembership, ...pagedMemberships] },
}
