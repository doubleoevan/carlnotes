import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { RestorePurchasesSection } from "./AccountSettings"

// Restore purchases, which the web has no counterpart for, in the card the other settings use
const meta: Meta<typeof RestorePurchasesSection> = {
	title: "Account/RestorePurchasesSection",
	component: RestorePurchasesSection,
	parameters: {
		webReference: "none: the web sells no store plan. Card from apps/web/src/components/account/AccountSettings.tsx",
	},
	decorators: [
		(Story) => (
			<View style={{ width: "100%" }}>
				<Story />
			</View>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const RestorePurchases: Story = {}
