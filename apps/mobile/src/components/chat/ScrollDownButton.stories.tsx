import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { ScrollDownButton } from "./ScrollDownButton"

// the component fixture and preview layout
const meta: Meta<typeof ScrollDownButton> = {
	title: "Chat/ScrollDownButton",
	component: ScrollDownButton,
	args: { isScrollDownShown: true, onScrollDown: () => {} },
	decorators: [
		(Story) => (
			<View className="h-32 w-full">
				<Story />
			</View>
		),
	],
	parameters: { webReference: "apps/web/src/components/chat/ScrollDownButton.tsx" },
}
export default meta
type Story = StoryObj<typeof meta>
// rendered component states
export const Default: Story = {}
export const Hidden: Story = { args: { isScrollDownShown: false } }
