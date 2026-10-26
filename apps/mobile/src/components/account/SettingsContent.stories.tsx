import type { Meta, StoryObj } from "@storybook/react-native"
import { ScrollView } from "react-native"
import { Text } from "@/components/primitives/text"
import { SettingsContent } from "./SettingsContent"

// account controls use the web's account page copy and no live account requests
const meta: Meta<typeof SettingsContent> = {
	title: "Account/SettingsContent",
	component: SettingsContent,
	parameters: { webReference: "apps/web/src/pages/AccountPage.tsx and layout-header--user at 375px" },
	args: {
		identity: "Coffee reader · @espresso",
		closeError: null,
		isPending: false,
		onSignOut: () => undefined,
		onCloseAccount: () => undefined,
	},
	decorators: [
		(Story) => (
			<ScrollView style={{ width: "100%" }}>
				<Story />
			</ScrollView>
		),
	],
	render: ({ identity, ...args }) => <SettingsContent {...args} identity={<Text>{identity}</Text>} />,
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Pending: Story = { args: { isPending: true } }
export const FailedDeletion: Story = { args: { closeError: "That didn't save. Carl suggests trying again." } }
