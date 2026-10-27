import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { ChatPill } from "./ChatPanelWidget"

// the component fixture and preview layout
const meta: Meta<typeof ChatPill> = {
	title: "Chat/ChatPill",
	component: ChatPill,
	args: { onOpenChat: () => {} },
}
export default meta
type Story = StoryObj<typeof meta>
// rendered component states
export const Default: Story = {}
