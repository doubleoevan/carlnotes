import { TEST_OWNER_TOPICS } from "@carlnotes/contracts/activityTestFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { OwnerTopicsTable } from "./OwnerTopicsTable"

// a daily topic with this month's scans and a weekly invite topic with emails off, as the web's story shows them
const meta = {
	title: "Table/OwnerTopicsTable",
	component: OwnerTopicsTable,
	parameters: { surface: "card", webReference: "apps/web/src/components/table/OwnerTopicsTable.tsx at 375px" },
	args: { topics: TEST_OWNER_TOPICS, onReloadPage: () => undefined },
} satisfies Meta<typeof OwnerTopicsTable>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Empty: Story = { args: { topics: [] } }
