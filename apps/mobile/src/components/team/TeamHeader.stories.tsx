import { toTestTeamPage } from "@carlnotes/contracts/teamTestFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { TeamHeader } from "./TeamHeader"

// a member's header with the counts and the description, and a leader's with the avatar picker, as on the web
const meta: Meta<typeof TeamHeader> = {
	title: "Team/TeamHeader",
	component: TeamHeader,
	parameters: { webReference: "apps/web/src/components/team/TeamHeader.tsx at 375px" },
	args: { teamPage: toTestTeamPage(), noteCount: 3, onReload: () => undefined },
}
export default meta
type Story = StoryObj<typeof meta>
export const Member: Story = {}
export const Leader: Story = { args: { teamPage: toTestTeamPage({ role: "leader" }) } }
