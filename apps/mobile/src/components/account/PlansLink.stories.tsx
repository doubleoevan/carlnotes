import { PURCHASE_COPY } from "@carlnotes/contracts/plans"
import type { Meta, StoryObj } from "@storybook/react-native"
import { Text } from "@/components/primitives/text"
import { PlansLink } from "./PlansLink"

// the plans link alone and inside a notice's line, as the web's sentence link
const meta: Meta<typeof PlansLink> = {
	title: "Account/PlansLink",
	component: PlansLink,
	args: { label: PURCHASE_COPY.pickUpMoreCoffee },
	parameters: { webReference: "apps/web/src/components/chat/ChatBudgetNotice.tsx sentence-link at 375px" },
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const InsideALine: Story = {
	render: (args) => (
		<Text className="text-sm text-muted-foreground">
			<PlansLink {...args} />
			{" to keep chatting."}
		</Text>
	),
}
