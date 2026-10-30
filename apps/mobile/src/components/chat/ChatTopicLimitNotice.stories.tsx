import type { Meta, StoryObj } from "@storybook/react-native"
import { ChatTopicLimitNotice } from "./ChatTopicLimitNotice"

// the new-topic chat's limit notice, which links to no plans in the app
const meta: Meta<typeof ChatTopicLimitNotice> = {
	title: "Chat/ChatTopicLimitNotice",
	component: ChatTopicLimitNotice,
	args: { topicLimit: 3 },
	parameters: { webReference: "apps/web/src/components/chat/ChatTopicLimitNotice.tsx, without the plans link" },
}
export default meta
type Story = StoryObj<typeof meta>
export const NoTopicsLeft: Story = {}
