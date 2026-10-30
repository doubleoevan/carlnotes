import type { Meta, StoryObj } from "@storybook/react-native"
import { PlanCard } from "./PlanCard"

// the plan card as the app shows it: a visitor's Get started, a user's own plan marked, and another plan with no action
const meta: Meta<typeof PlanCard> = {
	title: "Account/PlanCard",
	component: PlanCard,
	args: {
		plan: "plus",
		isYearly: false,
		isHighlighted: true,
		signedInPlan: null,
		subscribedInterval: null,
	},
	parameters: { webReference: "apps/web/src/components/account/PlanCard.tsx at 375px", surface: "page" },
}
export default meta
type Story = StoryObj<typeof meta>
export const Visitor: Story = {}
export const CurrentPlan: Story = { args: { signedInPlan: "plus", subscribedInterval: "monthly" } }
export const AnotherPlanReadOnly: Story = { args: { plan: "premium", isHighlighted: false, signedInPlan: "plus" } }
export const FreeUserReadOnly: Story = { args: { signedInPlan: "free", isHighlighted: false } }
