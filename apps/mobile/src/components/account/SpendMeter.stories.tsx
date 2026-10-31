import {
	SPEND_METER_STORY_ACTIVITY,
	SPEND_METER_STORY_NARROW_ACTIVITY,
} from "@carlnotes/core/lib/spendMeterStoryFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { SpendMeter } from "./SpendMeter"

// cover the web's grouped, moving, passed, and absent pause checkpoints
const meta = {
	title: "Account/SpendMeter",
	component: SpendMeter,
	parameters: { surface: "card", webReference: "Account/SpendMeter" },
	args: { activity: SPEND_METER_STORY_ACTIVITY, canPurchase: true },
} satisfies Meta<typeof SpendMeter>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const PassedCheckpoints: Story = { args: { activity: { ...meta.args.activity, scanSpendCents: 171 } } }
export const Spent: Story = { args: { activity: { ...meta.args.activity, scanSpendCents: 300 } } }
// a spent budget where the store sells no plan keeps the line without the plans link
export const SpentReadOnly: Story = {
	args: { activity: { ...meta.args.activity, scanSpendCents: 300 }, canPurchase: false },
}
export const NoCheckpoints: Story = { args: { activity: { ...meta.args.activity, monthlyBudgetCutoffs: [] } } }
// reveal all three legend colors and wrapping in the phone's account card
export const NarrowLegend: Story = {
	args: { activity: SPEND_METER_STORY_NARROW_ACTIVITY },
	decorators: [
		(Story) => (
			<View style={{ width: 296 }}>
				<Story />
			</View>
		),
	],
}
