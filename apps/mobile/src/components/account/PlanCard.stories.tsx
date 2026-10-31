import { PLAN_MANAGEMENT_LABELS } from "@carlnotes/core/lib/storefrontPurchaseRules"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { PlanCard } from "./PlanCard"

// the plan card as the app shows it: a visitor's Get started, a user's own plan marked, a free user's store purchase,
// a store subscriber's switch, a Stripe subscriber's web link, a storefront the store does not sell on, and the Plans
// screen's loading and store price failure around the cards
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
export const FreeUserUpgrade: Story = {
	args: {
		signedInPlan: "free",
		isHighlighted: false,
		storePrice: { price: "€21.99", billingNote: "Billed monthly" },
		onCheckout: () => {},
	},
}
export const FreeUserUpgradeYearly: Story = {
	args: {
		signedInPlan: "free",
		isYearly: true,
		isHighlighted: false,
		storePrice: { price: "€18.33", billingNote: "Billed €219.99 yearly" },
		onCheckout: () => {},
	},
}
export const StoreSubscriberSwitchPlan: Story = {
	args: {
		plan: "premium",
		isHighlighted: false,
		signedInPlan: "plus",
		subscribedInterval: "monthly",
		storePrice: { price: "$40.00", billingNote: "Billed monthly" },
		onCheckout: () => {},
	},
}
export const OtherStoreSubscriberManageInGooglePlay: Story = {
	args: {
		plan: "premium",
		isHighlighted: false,
		signedInPlan: "plus",
		subscribedInterval: "monthly",
		planManagementAction: { label: PLAN_MANAGEMENT_LABELS.play_store, onPress: () => {} },
	},
}
export const AnotherPlanReadOnly: Story = { args: { plan: "premium", isHighlighted: false, signedInPlan: "plus" } }
export const FreeUserReadOnly: Story = { args: { signedInPlan: "free", isHighlighted: false } }

// the Plans screen while the billing state and the store's offering load
export const PlansScreenLoading: Story = { render: () => <CoffeeLoading /> }

// the Plans screen's store price failure above the catalog's read-only card
export const StorePricesFailed: Story = {
	args: { signedInPlan: "free", isHighlighted: false },
	render: (args) => (
		<View className="gap-6">
			<LoadFailedNotice
				message="Store prices didn't load."
				retryLabel="Retry loading store prices"
				onRetry={() => {}}
			/>
			<PlanCard {...args} />
		</View>
	),
}
