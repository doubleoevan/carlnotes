import { toTestTopicFeed } from "@carlnotes/contracts/topicFeedTestFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { TopicInfoButton } from "./TopicInfo"
import { STORY_TOPIC_PAGE } from "./topicPageStories"

// open the complete topic note from its real trigger
const meta = {
	title: "Topic/TopicInfo",
	component: TopicInfoButton,
	parameters: { webReference: "apps/web/src/components/topic/TopicInfo.tsx at 375px" },
	args: {
		topic: toTestTopicFeed({
			scanSummary: "Fresh research on water temperature and grind size helps you make a better cup.",
			subscriberCount: 12,
			teamCount: 2,
		}),
	},
} satisfies Meta<typeof TopicInfoButton>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const WithPodcast: Story = { args: { topic: STORY_TOPIC_PAGE } }
export const Private: Story = { args: { topic: toTestTopicFeed({ visibility: "private" }) } }
export const Empty: Story = { args: { topic: toTestTopicFeed({ findings: [], scanSummary: null, owner: null }) } }
export const LongNotes: Story = {
	args: {
		topic: toTestTopicFeed({
			prompt: "Learn about brewing coffee with different methods. ".repeat(30),
			scanSummary: "Water temperature and grind size both matter.\n\n".repeat(30),
		}),
	},
}
