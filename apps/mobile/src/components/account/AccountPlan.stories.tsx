import { ACCOUNT_BUDGET_STORY_BILLING } from "@carlnotes/core/lib/accountBudgetStoryFixtures"
import { setStoreOffering } from "@carlnotes/core/stores/purchaseOffersStore"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { PlanButton } from "./AccountPlan"

// the App Store selling every plan on the US storefront
const FULL_STORE_OFFERING = { storeProvider: "app_store", storefrontCountryCode: "USA", hasFullOffering: true } as const

// Account's plan button: a free user's Upgrade where the store sells, nothing where it does not, and Manage plan for a
// store or a Stripe subscriber
const meta: Meta<typeof PlanButton> = {
	title: "Account/PlanButton",
	component: PlanButton,
	args: { billing: ACCOUNT_BUDGET_STORY_BILLING },
	parameters: { webReference: "apps/web/src/components/account/AccountPlan.tsx PlanButton at 375px" },
	beforeEach: () => {
		setStoreOffering(FULL_STORE_OFFERING)
	},
	decorators: [
		(Story) => (
			<View style={{ alignItems: "flex-start" }}>
				<Story />
			</View>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const FreeUserUpgrade: Story = {}
export const FreeUserReadOnly: Story = {
	beforeEach: () => {
		setStoreOffering(null)
	},
}
export const StoreSubscriberManagePlan: Story = {
	args: {
		billing: {
			...ACCOUNT_BUDGET_STORY_BILLING,
			plan: "plus",
			status: "active",
			hasPaymentMethod: true,
			provider: "app_store",
		},
	},
}
export const StripeSubscriberBilledOnWeb: Story = {
	args: {
		billing: {
			...ACCOUNT_BUDGET_STORY_BILLING,
			plan: "premium",
			status: "active",
			hasPaymentMethod: true,
			provider: "stripe",
			isOverageBillable: true,
		},
	},
}
