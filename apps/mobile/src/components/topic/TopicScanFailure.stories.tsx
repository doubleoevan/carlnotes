import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { TopicScanFailure } from "./TopicScanRecap"

// a budget failure with the Upgrade button where the store sells the user a plan, without it elsewhere, and a plain
// failure
const meta: Meta<typeof TopicScanFailure> = {
	title: "Topic/TopicScanFailure",
	component: TopicScanFailure,
	args: { error: "The budget has been exceeded for this key", canPurchase: true },
	parameters: { webReference: "apps/web/src/components/topic/TopicScanFailure.tsx at 375px", surface: "card" },
	decorators: [
		(Story) => (
			<View className="w-full">
				<Story />
			</View>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const BudgetWithUpgrade: Story = {}
export const BudgetReadOnly: Story = { args: { canPurchase: false } }
export const Failed: Story = { args: { error: "Scan failed" } }
