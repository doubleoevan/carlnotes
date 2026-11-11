// the mobile Topic Posts section, with the web stories' names
import { TOPIC_POST_CARD_STORY, TOPIC_POST_DRAFT_CARD_STORY } from "@carlnotes/core/lib/topicPostStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { TopicPostsSection } from "./TopicPostsSection"

const meta = {
	title: "TopicPost/TopicPostsSection",
	component: TopicPostsSection,
	parameters: { webReference: "apps/web/src/components/topicPost/TopicPostsSection.stories.tsx at 375px" },
	args: {
		topicId: "topic-1",
		topicPosts: [TOPIC_POST_DRAFT_CARD_STORY, TOPIC_POST_CARD_STORY],
		canPublish: true,
	},
} satisfies Meta<typeof TopicPostsSection>

export default meta
type Story = StoryObj<typeof meta>

// an editor sees their draft first, the count at the far right of the title, and the button that starts a draft
export const Default: Story = {}

// a reader sees the published cards and no button
export const Reader: Story = { args: { topicPosts: [TOPIC_POST_CARD_STORY], canPublish: false } }

// an editor of a Topic with no post yet sees the button and the empty line in a card, with no count
export const Empty: Story = { args: { topicPosts: [] } }
