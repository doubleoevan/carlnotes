import { TEST_TOPIC_INVITES } from "@carlnotes/contracts/activityTestFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { TopicInvitesTable } from "./TopicInvitesTable"

// an accepted invite, a pending one, and one to an address with no account, as the web's story shows them
const meta = {
	title: "Table/TopicInvitesTable",
	component: TopicInvitesTable,
	parameters: { surface: "card", webReference: "apps/web/src/components/table/TopicInvitesTable.tsx at 375px" },
	args: { invites: TEST_TOPIC_INVITES, onReload: () => undefined },
} satisfies Meta<typeof TopicInvitesTable>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
