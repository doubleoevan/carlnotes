// the mobile row details texts, with the web stories' names
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { DotSeparatedTexts } from "./DotSeparatedTexts"

const meta = {
	title: "Common/DotSeparatedTexts",
	component: DotSeparatedTexts,
	parameters: { webReference: "apps/web/src/components/common/DotSeparatedTexts.stories.tsx at 375px" },
	args: { texts: ["Podcast", "4 days ago", "14 listeners"] },
} satisfies Meta<typeof DotSeparatedTexts>

export default meta
type Story = StoryObj<typeof meta>

// the texts on one line, a dot before each after the first
export const Default: Story = {
	render: (args) => (
		<View className="flex-row flex-wrap items-center gap-1.5">
			<DotSeparatedTexts {...args} />
		</View>
	),
}

// a narrow line, where each text moves down whole with its dot
export const Narrow: Story = {
	render: (args) => (
		<View className="w-28 flex-row flex-wrap items-center gap-1.5">
			<DotSeparatedTexts {...args} />
		</View>
	),
}
