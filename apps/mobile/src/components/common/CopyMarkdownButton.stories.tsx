import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { CopyMarkdownButton } from "./CopyMarkdownButton"

// keep the corner control visible in the component browser
const meta: Meta<typeof CopyMarkdownButton> = {
	title: "Common/CopyMarkdownButton",
	component: CopyMarkdownButton,
	parameters: { webReference: "apps/web/src/components/common/CopyMarkdownButton.tsx", surface: "card" },
	args: { markdown: "# Carl's notes\n\nA useful finding." },
	decorators: [
		(Story) => (
			<View className="h-16 w-full">
				<Story />
			</View>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
