// a Team's members table: who belongs, the roles a leader changes, each member's own visibility, join requests, and
// the remove controls
import {
	sendApproveJoinRequest,
	sendRemoveTeamMember,
	sendTeamMemberRole,
	setTeamMemberVisibility,
} from "@carlnotes/client/teamClient"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn, mocked } from "storybook/test"
import { STORY_PEOPLE } from "../../../.storybook/fixtures"
import { STORY_TEAMS, type StoryTeamMember, toStoryTeamMember } from "../../../.storybook/fixtures/teams"
import { StoryTable } from "../../../.storybook/tableDecorators"
import { TableCard } from "./TableCard"
import { TeamMembersTable } from "./TeamMembersTable"

// the invented people on the team: Vienna, the signed-in user, then Carlos and Evan
const [VIENNA, CARLOS, EVAN] = STORY_PEOPLE

// a person who has asked to join and waits on a leader
const JAKE = { userId: "user-jake", username: "jake" }

// a team led by Vienna, with a member hidden from the public list and a request to join
const LED_TEAM_MEMBERS: StoryTeamMember[] = [
	toStoryTeamMember(VIENNA, { role: "leader" }),
	toStoryTeamMember(CARLOS),
	toStoryTeamMember(EVAN, { isMemberVisible: false }),
	toStoryTeamMember(JAKE, { isActive: false }),
]

// the same team led by Carlos, where Vienna is a member
const JOINED_TEAM_MEMBERS: StoryTeamMember[] = [
	toStoryTeamMember(VIENNA),
	toStoryTeamMember(CARLOS, { role: "leader" }),
	toStoryTeamMember(EVAN, { isMemberVisible: false }),
]

// the members a signed-out visitor sees, the hidden member left out of the list
const PUBLIC_TEAM_MEMBERS: StoryTeamMember[] = [
	toStoryTeamMember(VIENNA),
	toStoryTeamMember(CARLOS, { role: "leader" }),
]

// Vienna leading fourteen more members, enough for a second page
const LARGE_TEAM_MEMBERS: StoryTeamMember[] = [
	toStoryTeamMember(VIENNA, { role: "leader" }),
	...Array.from({ length: 14 }, (_, i) =>
		toStoryTeamMember({ userId: `user-member-${i + 1}`, username: `member${i + 1}` }),
	),
]

const meta = {
	title: "Table/TeamMembersTable",
	component: TeamMembersTable,
	args: {
		teamId: STORY_TEAMS.modelWatchers.teamId,
		members: LED_TEAM_MEMBERS,
		hiddenMemberCount: 0,
		isTeamLeader: true,
		isReadOnly: false,
		onChanged: fn(),
	},
	argTypes: {
		teamId: { control: "text" },
		members: { control: "object" },
		hiddenMemberCount: { control: { type: "number", min: 0 } },
		isTeamLeader: { control: "boolean" },
		isReadOnly: { control: "boolean" },
		onChanged: { control: false },
	},
	parameters: { session: "user" },
	// the team page sets the table in a card
	render: (args) => (
		<TableCard className="mb-2">
			<TeamMembersTable {...args} />
		</TableCard>
	),
	// every change succeeds without a request
	beforeEach: () => {
		mocked(sendTeamMemberRole).mockResolvedValue(true)
		mocked(sendRemoveTeamMember).mockResolvedValue(true)
		mocked(sendApproveJoinRequest).mockResolvedValue("joined")
		mocked(setTeamMemberVisibility).mockResolvedValue(undefined)
	},
} satisfies Meta<typeof TeamMembersTable>

export default meta
type Story = StoryObj<typeof meta>

// a leader's view: role selects, switches, and remove buttons on every row, with a request to join switched off
export const LeaderView: Story = {}

// a member's view: the roles read only, and the controls on the member's own row alone
export const MemberView: Story = { args: { members: JOINED_TEAM_MEMBERS, isTeamLeader: false } }

// a signed-out visitor's view: no controls, and a total that counts the hidden members
export const PublicView: Story = {
	args: { members: PUBLIC_TEAM_MEMBERS, hiddenMemberCount: 1, isTeamLeader: false },
	parameters: { session: "visitor" },
}

// the admin console's read-only view, where no row acts as the admin's own. the members table opens on the sunken fill
// under a team row of the admin teams table, which lists the active members alone
export const AdminReadOnly: Story = {
	args: { members: LED_TEAM_MEMBERS.filter((member) => member.isActive), isTeamLeader: false, isReadOnly: true },
	parameters: { session: "admin" },
	render: (args) => (
		<StoryTable className="min-w-3xl [&_tbody_tr:last-child>*]:border-b-0">
			<tr className="border-b">
				<td colSpan={7} className="py-2">
					<TableCard className="bg-sunken mb-0 shadow-none">
						<TeamMembersTable {...args} />
					</TableCard>
				</td>
			</tr>
		</StoryTable>
	),
}

// fifteen members, paged ten at a time
export const ManyMembers: Story = { args: { members: LARGE_TEAM_MEMBERS } }

// fifteen members in the admin console's subtable, whose Rows select and pager buttons take the sunken fill's border
export const ManyMembersInAdminSubtable: Story = {
	...AdminReadOnly,
	args: { members: LARGE_TEAM_MEMBERS, isTeamLeader: false, isReadOnly: true },
}
