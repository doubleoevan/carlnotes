import { TEST_RELATED_TOPICS } from "@carlnotes/contracts/topicFeedTestFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { RelatedTopicsSection } from "./RelatedTopicsSection"

// paged rows, one page without pagination, and a topic with no related topics, which renders nothing
const meta = {
	title: "Topic/RelatedTopicsSection",
	component: RelatedTopicsSection,
	args: { relatedTopics: TEST_RELATED_TOPICS },
} satisfies Meta<typeof RelatedTopicsSection>
export default meta
type Story = StoryObj<typeof meta>
export const Paginated: Story = {}
export const OnePage: Story = { args: { relatedTopics: TEST_RELATED_TOPICS.slice(0, 3) } }
export const Empty: Story = { args: { relatedTopics: [] } }
