import { ACCOUNT_BUDGET_STORY_BILLING } from "@carlnotes/core/lib/accountBudgetStoryFixtures"
import { SPEND_METER_STORY_ACTIVITY } from "@carlnotes/core/lib/spendMeterStoryFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, within } from "storybook/test"
import { STORY_USER, toStoryProfile } from "../../../.storybook/fixtures"
import { AccountBudget } from "./AccountBudget"

// the account page's budget section: the coffee fund card with the month's image regenerations, and the daily scans
// card, at the account page's width
const meta = {
	title: "Account/AccountBudget",
	component: AccountBudget,
	args: {
		billing: ACCOUNT_BUDGET_STORY_BILLING,
		activity: {
			...SPEND_METER_STORY_ACTIVITY,
			user: toStoryProfile(STORY_USER),
			topics: [],
			subscriptions: [],
			invites: [],
		},
	},
	decorators: [
		(Story) => (
			<div className="w-full max-w-3xl space-y-6">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof AccountBudget>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {
	play: async ({ canvasElement }) => {
		// the coffee fund card names the month's image regenerations
		await expect(within(canvasElement).getByText("1 of 2 used this month")).toBeInTheDocument()
	},
}
// an admin has no regeneration limit, so the line is left out
export const NoRegenerationLimit: Story = {
	args: { billing: { ...ACCOUNT_BUDGET_STORY_BILLING, imageRegenerationQuota: null } },
}
export const ReadOnly: Story = { args: { isReadOnly: true } }
