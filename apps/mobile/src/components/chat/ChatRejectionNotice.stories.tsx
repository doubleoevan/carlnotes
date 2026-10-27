import { toChatTopicLimitCopy } from "@carlnotes/core/lib/chatRejectionCopy"
import type { Meta, StoryObj } from "@storybook/react-native"
import { Text } from "@/components/primitives/text"
import { ChatRejectionNotice } from "./ChatRejectionNotice"

// the component fixture and preview layout
const meta: Meta<typeof ChatRejectionNotice> = {
	title: "Chat/ChatRejectionNotice",
	component: ChatRejectionNotice,
	args: { rejection: "budget" },
	parameters: { webReference: "apps/web/src/components/chat/ChatMessageParts.tsx" },
}
export default meta
type Story = StoryObj<typeof meta>
// rendered component states
export const Budget: Story = {}
export const RateLimited: Story = { args: { rejection: "rateLimited" } }
export const Forbidden: Story = { args: { rejection: "forbidden" } }
export const Failed: Story = { args: { rejection: "failed", onRetry: () => {} } }
export const Unreadable: Story = { args: { rejection: "attachmentUnreadable" } }
export const TooLarge: Story = { args: { rejection: "attachmentTooLarge" } }
export const Busy: Story = { args: { rejection: "attachmentBusy" } }
export const TopicLimit: Story = { render: () => <Text>{toChatTopicLimitCopy(3)}</Text> }
