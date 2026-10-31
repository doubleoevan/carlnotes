import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { DeleteAccountSection } from "./AccountSettings"

// the Close your account section: the web's words, and a store subscriber's with the store's page beside the button
const meta: Meta<typeof DeleteAccountSection> = {
	title: "Account/DeleteAccountSection",
	component: DeleteAccountSection,
	args: { provider: null },
	parameters: { webReference: "apps/web/src/components/account/AccountSettings.tsx Close your account at 375px" },
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
export const FreeUserOrStripeSubscriber: Story = {}
export const AppStoreSubscriber: Story = { args: { provider: "app_store" } }
export const GooglePlaySubscriber: Story = { args: { provider: "play_store" } }
