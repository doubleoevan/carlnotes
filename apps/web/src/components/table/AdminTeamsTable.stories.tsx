// the admin console's teams table: each team's visibility, members and topics subtables, and its topics' spend
import { fetchAdminTeamMembers, fetchAdminTeamTopics } from "@carlnotes/client/billingClient"
import type { AdminTeamRow } from "@carlnotes/contracts/admin"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, mocked } from "storybook/test"
import { FIXTURE_DATE, STORY_PEOPLE } from "../../../.storybook/fixtures"
import { STORY_TEAMS, type StoryTeamMember, toStoryTeamMember } from "../../../.storybook/fixtures/teams"
import { OWNER_TOPIC_FIXTURES } from "../../../.storybook/fixtures/topics"
import { AdminTeamsTable } from "./AdminTeamsTable"

// a public team, a private one, and a team with no topics yet
const ADMIN_TEAM_ROW_FIXTURES: AdminTeamRow[] = [
	{
		...STORY_TEAMS.readingGroup,
		isPublic: true,
		createdAt: FIXTURE_DATE.toISOString(),
		memberCount: STORY_PEOPLE.length,
		topicCount: OWNER_TOPIC_FIXTURES.length,
		scanSpendCents: 640,
		chatSpendCents: 120,
	},
	{
		teamId: "team-eval-lab",
		name: "Eval Lab",
		isPublic: false,
		createdAt: FIXTURE_DATE.toISOString(),
		avatarVersion: null,
		memberCount: 2,
		topicCount: 1,
		scanSpendCents: 210,
		chatSpendCents: 45,
	},
	{
		teamId: "team-infra-notes",
		name: "Infra Notes",
		isPublic: true,
		createdAt: FIXTURE_DATE.toISOString(),
		avatarVersion: null,
		memberCount: 1,
		topicCount: 0,
		scanSpendCents: 0,
		chatSpendCents: 0,
	},
]

// the first team's members: its leader and two members, one of them hidden from the public members list
const TEAM_MEMBER_FIXTURES: StoryTeamMember[] = STORY_PEOPLE.map((person, i) =>
	toStoryTeamMember(person, { role: i === 0 ? "leader" : "member", isMemberVisible: i !== STORY_PEOPLE.length - 1 }),
)

const meta = {
	title: "Table/AdminTeamsTable",
	component: AdminTeamsTable,
	args: { teams: ADMIN_TEAM_ROW_FIXTURES },
	parameters: { session: "admin" },
	// a team's subtables load its members and topics from the mocked billing client
	beforeEach: () => {
		mocked(fetchAdminTeamMembers).mockResolvedValue(TEAM_MEMBER_FIXTURES)
		mocked(fetchAdminTeamTopics).mockResolvedValue(OWNER_TOPIC_FIXTURES)
	},
} satisfies Meta<typeof AdminTeamsTable>

export default meta
type Story = StoryObj<typeof meta>

// three teams with their totals line
export const Default: Story = {}

// the first team's members subtable, read-only, opened by a click on its member count
export const MembersOpen: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /^Show Reading Group's members, \d+$/ }))
		await expect(await canvas.findByRole("link", { name: "carlos" })).toBeVisible()
	},
}

// the first team's topics subtable, opened by a click on its topic count
export const TopicsOpen: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /^Show Reading Group's topics, \d+$/ }))
		await expect(await canvas.findByRole("link", { name: "LLM tooling" })).toBeVisible()
	},
}

// no teams, which leaves the headings and a totals line of zeros
export const Empty: Story = { args: { teams: [] } }
