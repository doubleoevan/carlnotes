import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { ChatPill } from "./ChatPanelWidget"

// the component fixture and preview layout
const meta: Meta<typeof ChatPill> = {
	title: "Chat/ChatPill",
	component: ChatPill,
	args: { onOpenChat: () => {} },
	decorators: [
		(Story) => (
			<View className="items-end p-4">
				<Story />
			</View>
		),
	],
	parameters: { webReference: "apps/web/src/components/chat/ChatPanelWidget.tsx" },
}
export default meta
type Story = StoryObj<typeof meta>
// rendered component states
export const Default: Story = {}
