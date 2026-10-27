import type { Meta, StoryObj } from "@storybook/react-native"
import { ShareMarkdownButton } from "./ShareMarkdownButton"

const meta: Meta<typeof ShareMarkdownButton> = {
	title: "Common/ShareMarkdownButton",
	component: ShareMarkdownButton,
	args: { markdown: "# Carl's notes\n\nA useful finding.\n\nhttps://carlnotes.com/topics/example" },
	parameters: { surface: "card" },
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
