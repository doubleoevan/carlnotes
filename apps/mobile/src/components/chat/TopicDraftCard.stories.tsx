import { CHAT_STORY_DRAFT } from "@carlnotes/core/lib/chatStoryFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { TopicDraftCard } from "./TopicDraftCard"

// the component fixture and preview layout
const meta: Meta<typeof TopicDraftCard> = {
	title: "Chat/TopicDraftCard",
	component: TopicDraftCard,
	args: {
		topicId: "story-topic",
		topicDraft: CHAT_STORY_DRAFT,
		isTopicEditProposed: true,
		onDismissTopicEdit: () => {},
	},
	parameters: { webReference: "apps/web/src/components/chat/TopicDraftCard.tsx", surface: "card" },
}
export default meta
type Story = StoryObj<typeof meta>
// rendered component states
export const ProposedChange: Story = { args: { topicDraft: { ...CHAT_STORY_DRAFT, frequency: "daily" } } }
export const Loading: Story = { args: { isCarlReplying: true } }
export const Saved: Story = { args: { isTopicEditProposed: false } }
export const Cancelled: Story = { args: { isTopicEditProposed: false } }
export const Rejected: Story = { args: { isTopicEditProposed: true } }
// the new-topic chat's draft, with no topic yet: filled with files, and while Carl writes it
export const NewTopicWithFiles: Story = {
	args: {
		topicId: null,
		isTopicEditProposed: false,
		onDismissTopicEdit: undefined,
		attachmentFiles: [
			{ name: "harvest-report.pdf", size: 120_000, lastModified: 0 },
			{ name: "a-very-long-photo-name-from-the-camera-roll.jpg", size: 480_000, lastModified: 0 },
		],
		onRemoveAttachmentFile: () => {},
	},
}
export const NewTopicLoading: Story = {
	args: { topicId: null, isTopicEditProposed: false, onDismissTopicEdit: undefined, isCarlReplying: true },
}
