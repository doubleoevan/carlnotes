import type { Meta, StoryObj } from "@storybook/react-native"
import { RelatedTopicsSection } from "./RelatedTopicsSection"
import { STORY_TOPIC_PAGE } from "./topicPageStories"

// the matching web section exercises sorting, collapse, navigation, and podcast handoff
const meta = {
	title: "Topic/RelatedTopicsSection",
	component: RelatedTopicsSection,
	parameters: { webReference: "apps/web/src/components/topic/RelatedTopicsSection.tsx" },
	args: { relatedTopics: STORY_TOPIC_PAGE.relatedTopics },
} satisfies Meta<typeof RelatedTopicsSection>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Empty: Story = { args: { relatedTopics: [] } }
