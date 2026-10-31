import type { Meta, StoryObj } from "@storybook/react-native"
import { ChatTopicLimitNotice } from "./ChatTopicLimitNotice"

// the new-topic chat's limit notice, with the plans link where the store sells the user a plan and without it elsewhere
const meta: Meta<typeof ChatTopicLimitNotice> = {
	title: "Chat/ChatTopicLimitNotice",
	component: ChatTopicLimitNotice,
	args: { topicLimit: 3, canPurchase: true },
	parameters: { webReference: "apps/web/src/components/chat/ChatTopicLimitNotice.tsx at 375px" },
}
export default meta
type Story = StoryObj<typeof meta>
export const NoTopicsLeft: Story = {}
export const ReadOnly: Story = { args: { canPurchase: false } }
