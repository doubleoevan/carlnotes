import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { ModelThinkingBubble } from "@/components/chat/ChatMessageParts"
import { ThinkingLine } from "./ThinkingLine"

// the shared phrases rendered with mobile Nightshift text and motion
const meta: Meta<typeof ThinkingLine> = {
	title: "Common/ThinkingLine",
	component: ThinkingLine,
	parameters: { webReference: "apps/web/src/components/common/ThinkingLine.tsx", surface: "card" },
}
export default meta
type Story = StoryObj<typeof meta>

// system Reduce Motion and text size can be changed while these stories remain mounted
export const Default: Story = {}
export const Narrow: Story = {
	render: () => (
		<View style={{ width: 160 }}>
			<ThinkingLine />
		</View>
	),
}
export const ChatBubble: Story = { render: () => <ModelThinkingBubble /> }
