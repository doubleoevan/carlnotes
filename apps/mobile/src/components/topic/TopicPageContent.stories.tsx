import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { TopicPageContent } from "./TopicPageContent"
import { STORY_TOPIC_FEED_HANDLERS } from "./topicFeedStories"
import { STORY_FILM_TOPIC_PAGE, STORY_TOPIC_PAGE, TopicPageStoryProvider } from "./topicPageStories"

// the complete page keeps network reads and Finding writes inert
const meta: Meta<typeof TopicPageContent> = {
	title: "Topic/TopicPageContent",
	component: TopicPageContent,
	parameters: { webReference: "apps/web/src/pages/TopicPage.tsx at 375px" },
	args: {
		topic: STORY_TOPIC_PAGE,
		findings: STORY_TOPIC_PAGE.findings,
		state: { handlers: STORY_TOPIC_FEED_HANDLERS, pendingChanges: [], isReheating: false },
		onRefresh: () => undefined,
	},
	decorators: [
		(Story) => (
			<TopicPageStoryProvider>
				<View className="w-full flex-1">
					<Story />
				</View>
			</TopicPageStoryProvider>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

// every section in the page's order: the film section, the podcast player, the findings, the comment thread, the
// Topic Posts, then the cards with the films list right before the podcast episodes list
export const EverySection: Story = {
	args: { topic: STORY_FILM_TOPIC_PAGE, findings: STORY_FILM_TOPIC_PAGE.findings },
}
