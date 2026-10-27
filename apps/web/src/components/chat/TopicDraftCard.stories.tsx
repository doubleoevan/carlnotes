import { CHAT_STORY_DRAFT } from "@carlnotes/core/lib/chatStoryFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
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
	parameters: { surface: "card" },
}
export default meta
type Story = StoryObj<typeof meta>
// rendered component states
export const ProposedChange: Story = { args: { topicDraft: { ...CHAT_STORY_DRAFT, frequency: "daily" } } }
export const Loading: Story = { args: { isCarlReplying: true } }
export const Saved: Story = { args: { isTopicEditProposed: false } }
export const Cancelled: Story = { args: { isTopicEditProposed: false } }
export const Rejected: Story = { args: { isTopicEditProposed: true } }
