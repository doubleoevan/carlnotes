import type { Meta, StoryObj } from "@storybook/react-native"
import { ShimmerText } from "./ShimmerText"

const meta: Meta<typeof ShimmerText> = {
	title: "Common/ShimmerText",
	component: ShimmerText,
	args: { children: "Carl and Vienna are recording..." },
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const LongText: Story = {
	args: { children: "Carl is reading the findings and comparing the sources before recording the next episode." },
}
