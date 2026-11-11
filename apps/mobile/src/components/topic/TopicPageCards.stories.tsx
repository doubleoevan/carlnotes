import type { Meta, StoryObj } from "@storybook/react-native"
import { ScrollView } from "react-native"
import { STORY_FILM_TOPIC_PAGE, STORY_TOPIC_PAGE, TopicPageStoryProvider } from "@/components/topic/topicPageStories"
import { TopicPageCards } from "./TopicPageCards"

// the complete fixture exercises the matching web card without account requests
const meta: Meta<typeof TopicPageCards> = {
	title: "Topic/TopicPageCards",
	component: TopicPageCards,
	parameters: { webReference: "apps/web/src/pages/TopicPage.tsx at 375px" },
	args: { topic: STORY_TOPIC_PAGE },
	decorators: [
		(Story) => (
			<TopicPageStoryProvider>
				<ScrollView className="w-full">
					<Story />
				</ScrollView>
			</TopicPageStoryProvider>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}

// a topic with films shows the films list, with its count, right before the podcast episodes list
export const WithFilms: Story = { args: { topic: STORY_FILM_TOPIC_PAGE } }
