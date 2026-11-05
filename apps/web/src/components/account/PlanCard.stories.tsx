import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { PlanCard } from "./PlanCard"

// the same shared feature rows for every plan and billing interval, at a phone-friendly card width
const meta: Meta<typeof PlanCard> = {
	title: "Account/PlanCard",
	component: PlanCard,
	args: { plan: "plus", isYearly: false, isHighlighted: false, signedInPlan: null, subscribedInterval: null },
	decorators: [
		(Story) => (
			<div className="w-full max-w-sm p-2">
				<Story />
			</div>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>

// AI chats are included on Free; Plus and Premium also include email
export const Free: Story = { args: { plan: "free" } }
export const Plus: Story = {}
export const Premium: Story = { args: { plan: "premium" } }
export const PlusYearly: Story = { args: { isYearly: true } }
