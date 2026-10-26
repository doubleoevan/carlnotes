import { toTestTopicFeed } from "@carlnotes/contracts/topicFeedTestFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { ShareTopic } from "./ShareTopic"

// the web's share options use a native sheet and the platform's send dialog
const meta = {
	title: "Share/ShareTopic",
	component: ShareTopic,
	parameters: { webReference: "apps/web/src/components/share/ShareTopic.tsx, native share sheet" },
	args: { topic: toTestTopicFeed() },
} satisfies Meta<typeof ShareTopic>
export default meta
type Story = StoryObj<typeof meta>
export const Public: Story = {}
export const Labeled: Story = { args: { isLabeled: true } }
export const Private: Story = { args: { topic: toTestTopicFeed({ visibility: "private" }) } }
