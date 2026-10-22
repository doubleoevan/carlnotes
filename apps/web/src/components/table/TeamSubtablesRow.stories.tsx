// the row a teams table opens under a team: the team's topics or members subtable, loading until the team page arrives
import {
	sendApproveJoinRequest,
	sendRemoveTeamMember,
	sendRemoveTopicFromTeam,
	sendTeamMemberRole,
	setTeamMemberVisibility,
} from "@carlnotes/client/teamClient"
import { fetchTopicPage, sendSubscriptionEmail } from "@carlnotes/client/topicClient"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn, mocked } from "storybook/test"
import { STORY_PEOPLE } from "../../../.storybook/fixtures"
import { STORY_TEAMS, toStoryTeamMember, toStoryTeamPage } from "../../../.storybook/fixtures/teams"
import { toStoryTopic } from "../../../.storybook/fixtures/topics"
import { toTableBodyDecorator } from "../../../.storybook/tableDecorators"
import { TeamSubtablesRow } from "./TeamSubtablesRow"

// the invented people on the team: Vienna, the signed-in user, then Carlos and Evan
const [VIENNA, CARLOS, EVAN] = STORY_PEOPLE

// the team page as its leader Vienna loads it: every member, a waiting join request, and two topics
const teamPage: TeamPageResponse = toStoryTeamPage({
	...STORY_TEAMS.designGuild,
	isPublic: true,
	role: "leader",
	members: [
		toStoryTeamMember(VIENNA, { role: "leader" }),
		toStoryTeamMember(CARLOS, { isMemberVisible: false }),
		toStoryTeamMember(EVAN, { isActive: false }),
	],
	topics: [
		toStoryTopic({ id: "topic-llm-tooling", name: "LLM tooling", subscriberCount: 14, isEmailEnabled: true }),
		toStoryTopic({
			id: "topic-design-systems",
			name: "Design systems",
			visibility: "invite",
			createdAt: "2026-05-18T12:00:00.000Z",
			keptCount: 9,
			seenCount: 75,
		}),
	],
})

// the same team page as a non-member loads it: the visible active members with Carlos's hidden membership
// counted, and the public topics
const nonMemberTeamPage: TeamPageResponse = {
	...teamPage,
	role: null,
	members: teamPage.members.filter((member) => member.isActive && member.isMemberVisible),
	hiddenMemberCount: 1,
	topics: teamPage.topics.filter((topic) => topic.visibility === "public"),
}

const meta = {
	title: "Table/TeamSubtablesRow",
	component: TeamSubtablesRow,
	args: {
		teamId: teamPage.teamId,
		teamRole: "leader",
		isReadOnly: false,
		openSubtable: "topics",
		teamPage,
		columnCount: 11,
		onChanged: fn(),
	},
	argTypes: {
		teamId: { control: "text" },
		teamRole: { control: "inline-radio", options: ["leader", "member", "none"], mapping: { none: null } },
		isReadOnly: { control: "boolean" },
		openSubtable: { control: "inline-radio", options: ["topics", "members"] },
		teamPage: { control: "object" },
		columnCount: { control: "number" },
		onChanged: { control: false },
	},
	parameters: { session: "user" },
	// the row spans a teams table, which sits in its card
	// the rows render in a table as wide as the one the app opens them in
	decorators: [toTableBodyDecorator("min-w-3xl")],
	// the leader's topic and member controls, and the topics table's email switch and kept popover, each resolve
	// without a request
	beforeEach: () => {
		mocked(sendRemoveTopicFromTeam).mockResolvedValue(true)
		mocked(sendTeamMemberRole).mockResolvedValue(true)
		mocked(sendRemoveTeamMember).mockResolvedValue(true)
		mocked(sendApproveJoinRequest).mockResolvedValue("joined")
		mocked(setTeamMemberVisibility).mockResolvedValue(undefined)
		mocked(sendSubscriptionEmail).mockResolvedValue(undefined)
		mocked(fetchTopicPage).mockResolvedValue({ status: "missing" })
	},
} satisfies Meta<typeof TeamSubtablesRow>

export default meta
type Story = StoryObj<typeof meta>

// the team page still loading under the row
export const Loading: Story = {
	args: { teamPage: null },
}

// the team's topics for its leader, with the Active switch and the remove button on each topic
export const Topics: Story = {}

// the team's topics for a member, who can read them but not remove them
export const TopicsForMember: Story = {
	args: { teamRole: "member" },
}

// a team that holds no topics yet
export const NoTopics: Story = {
	args: { teamPage: { ...teamPage, topics: [] } },
}

// the team's members for its leader: the role selects, Vienna's own visibility select, and a waiting join request
export const Members: Story = {
	args: { openSubtable: "members" },
}

// the team's members on Vienna's profile as Laura, a non-member, reads it: no controls, and the hidden member counted
export const MembersReadOnly: Story = {
	args: { openSubtable: "members", isReadOnly: true, teamPage: nonMemberTeamPage, columnCount: 6 },
	parameters: { session: "admin" },
}
