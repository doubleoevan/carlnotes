import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { ChatAuthor } from "./ChatAuthor"

// the component fixture and preview layout
const meta: Meta<typeof ChatAuthor> = {
	title: "Chat/ChatAuthor",
	component: ChatAuthor,
	args: { authorUserId: null, authorUsername: "Carl", children: <span>Here is what I read.</span> },
	parameters: { webReference: "apps/web/src/components/chat/ChatAuthor.tsx" },
}
export default meta
type Story = StoryObj<typeof meta>
// rendered component states
export const Carl: Story = {}
export const Reader: Story = {
	args: { authorUserId: "story-reader", authorUsername: "reader", isOwnChatMessage: true },
}
