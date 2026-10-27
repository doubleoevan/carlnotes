import type { Meta, StoryObj } from "@storybook/react-native"
import { TopicAttachmentLink } from "./TopicAttachmentLink"

// show the same owner download, source link, and unavailable states as the browser
const meta = {
	title: "Topic/TopicAttachmentLink",
	component: TopicAttachmentLink,
	parameters: { webReference: "apps/web/src/components/topic/TopicAttachmentEditor.tsx" },
	args: {
		isTopicOwner: true,
		attachment: {
			id: "storybook-file",
			filename: "Research.pdf",
			sourceUrl: null,
			status: "ready",
			context: null,
			failureMessage: null,
		},
	},
} satisfies Meta<typeof TopicAttachmentLink>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const NonOwner: Story = { args: { isTopicOwner: false } }
export const Processing: Story = { args: { attachment: { ...meta.args.attachment, status: "pending" } } }
export const Failed: Story = { args: { attachment: { ...meta.args.attachment, status: "failed" } } }
export const Source: Story = {
	args: { attachment: { ...meta.args.attachment, sourceUrl: "https://carlnotes.com/docs" } },
}
