import type { Meta, StoryObj } from "@storybook/react-native"
import { Text } from "@/components/primitives/text"
import { ChatAuthor } from "./ChatAuthor"

// the component fixture and preview layout
const meta: Meta<typeof ChatAuthor> = {
	title: "Chat/ChatAuthor",
	component: ChatAuthor,
	args: { authorUserId: null, authorUsername: "Carl" },
	render: (args) => (
		<ChatAuthor {...args}>
			<Text>Here is what I read.</Text>
		</ChatAuthor>
	),
	parameters: { webReference: "apps/web/src/components/chat/ChatAuthor.tsx" },
}
export default meta
type Story = StoryObj<typeof meta>
// rendered component states
export const Carl: Story = {}
export const Reader: Story = {
	args: { authorUserId: "story-reader", authorUsername: "reader", isOwnChatMessage: true },
}
