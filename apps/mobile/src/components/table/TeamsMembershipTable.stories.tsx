import { TEST_RECEIVED_INVITES, TEST_TEAM_SUMMARIES } from "@carlnotes/contracts/teamTestFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { TeamsMembershipTable } from "./TeamsMembershipTable"

// a team the user leads alone, a team they were invited onto, and an invite waiting, as the web's story shows them
const meta = {
	title: "Table/TeamsMembershipTable",
	component: TeamsMembershipTable,
	parameters: { surface: "card", webReference: "apps/web/src/components/table/TeamsMembershipTable.tsx at 375px" },
	args: {
		teams: TEST_TEAM_SUMMARIES,
		receivedInvites: TEST_RECEIVED_INVITES,
		isReadOnly: false,
		onChanged: () => undefined,
	},
} satisfies Meta<typeof TeamsMembershipTable>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const ReadOnly: Story = { args: { receivedInvites: [], isReadOnly: true } }
