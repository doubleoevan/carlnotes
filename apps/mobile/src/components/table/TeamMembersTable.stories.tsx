import { toTestTeamPage } from "@carlnotes/contracts/teamTestFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { TeamMembersTable } from "./TeamMembersTable"

// the team's members: a leader, a member, and a waiting join request, as the web's story shows them
const teamPage = toTestTeamPage()
const members = teamPage.members.map((member) => (member.username === "mira" ? { ...member, isActive: false } : member))

const meta = {
	title: "Table/TeamMembersTable",
	component: TeamMembersTable,
	parameters: { surface: "card", webReference: "apps/web/src/components/table/TeamMembersTable.tsx at 375px" },
	args: {
		teamId: teamPage.teamId,
		members,
		hiddenMemberCount: 0,
		isTeamLeader: true,
		isReadOnly: false,
		onChanged: () => undefined,
	},
} satisfies Meta<typeof TeamMembersTable>
export default meta
type Story = StoryObj<typeof meta>
export const Leader: Story = {}
export const Member: Story = { args: { isTeamLeader: false } }
export const ReadOnly: Story = { args: { isTeamLeader: false, isReadOnly: true, hiddenMemberCount: 1 } }
