import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { Meta, StoryObj } from "@storybook/react-native"
import { ScrollView } from "react-native"
import { STORY_TOPIC_PAGE, TopicPageStoryProvider } from "@/components/topic/topicPageStories"
import { NotesSection } from "./NotesSection"

// the complete fixture exercises the matching web card without account requests
const meta: Meta<{ topic: TopicResponse }> = {
	title: "Note/NotesSection",
	component: NotesSection,
	parameters: { webReference: "apps/web/src/components/note/NotesSection.tsx at 375px" },
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
