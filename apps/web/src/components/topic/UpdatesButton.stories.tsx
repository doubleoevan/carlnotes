import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { UpdatesButton } from "./UpdatesButton"

const meta = {
	title: "Topic/UpdatesButton",
	component: UpdatesButton,
	args: { minutes: 30, onSelect: fn() },
} satisfies Meta<typeof UpdatesButton>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
