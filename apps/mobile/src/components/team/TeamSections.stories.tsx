import { toTestTeamPage } from "@carlnotes/contracts/teamTestFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { TeamSections } from "./TeamSections"

// the members and topics a member reads, a team with no topics yet, and members the table does not list, as on the web
const meta: Meta<typeof TeamSections> = {
	title: "Team/TeamSections",
	component: TeamSections,
	parameters: { webReference: "apps/web/src/components/team/TeamSections.tsx at 375px" },
	args: { teamPage: toTestTeamPage(), notesSection: null, onReload: () => undefined },
}
export default meta
type Story = StoryObj<typeof meta>
export const Member: Story = {}
export const NoTopics: Story = { args: { teamPage: toTestTeamPage({ topics: [] }) } }
export const HiddenMembers: Story = { args: { teamPage: toTestTeamPage({ hiddenMemberCount: 4 }) } }
