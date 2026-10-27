import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { ScrollDownButton } from "./ScrollDownButton"

// the component fixture and preview layout
const meta: Meta<typeof ScrollDownButton> = {
	title: "Chat/ScrollDownButton",
	component: ScrollDownButton,
	args: { isScrollDownShown: true, onScrollDown: () => {} },
	decorators: [
		(Story) => (
			<div className="relative h-32 w-full">
				<Story />
			</div>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
// rendered component states
export const Default: Story = {}
export const Hidden: Story = { args: { isScrollDownShown: false } }
