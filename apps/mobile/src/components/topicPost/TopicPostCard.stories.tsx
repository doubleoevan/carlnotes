// the mobile Topic Post card, with the web stories' names. the ground shows in place of the image, which a story
// reads no api for
import { TOPIC_POST_CARD_STORY, TOPIC_POST_DRAFT_CARD_STORY } from "@carlnotes/core/lib/topicPostStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { TopicPostCard } from "./TopicPostCard"

const meta = {
	title: "TopicPost/TopicPostCard",
	component: TopicPostCard,
	parameters: { webReference: "apps/web/src/components/topicPost/TopicPostCard.stories.tsx at 375px" },
	args: { topicPost: TOPIC_POST_CARD_STORY },
	render: (args) => (
		<View className="w-80">
			<TopicPostCard {...args} />
		</View>
	),
} satisfies Meta<typeof TopicPostCard>

export default meta
type Story = StoryObj<typeof meta>

// the card as a Topic's Topic Posts section shows it
export const Default: Story = {}

// the author's own draft is marked Draft in the date's place
export const Draft: Story = { args: { topicPost: TOPIC_POST_DRAFT_CARD_STORY } }

// a post with no summary and no reactions yet keeps its byline alone
export const NoSummary: Story = { args: { topicPost: { ...TOPIC_POST_CARD_STORY, summary: null, reactionCount: 0 } } }
