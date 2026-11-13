import { TEST_SUBSCRIPTIONS } from "@carlnotes/contracts/activityTestFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { TopicSubscriptionsTable } from "./TopicSubscriptionsTable"

// a team topic followed with emails on, a follow switched off, and a pending invite, as the web's story shows them
const meta = {
	title: "Table/TopicSubscriptionsTable",
	component: TopicSubscriptionsTable,
	parameters: { surface: "card", webReference: "apps/web/src/components/table/TopicSubscriptionsTable.tsx at 375px" },
	args: { subscriptions: TEST_SUBSCRIPTIONS, onReloadPage: () => undefined },
} satisfies Meta<typeof TopicSubscriptionsTable>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
