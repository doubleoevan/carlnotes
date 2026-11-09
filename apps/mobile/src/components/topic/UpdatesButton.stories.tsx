import type { Meta, StoryObj } from "@storybook/react-native"
import { UpdatesButton } from "./UpdatesButton"

// the web's lengths, in a native sheet, with the shown length marked
const meta = {
	title: "Topic/UpdatesButton",
	component: UpdatesButton,
	args: { minutes: 30, onSelect: () => {} },
} satisfies Meta<typeof UpdatesButton>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
