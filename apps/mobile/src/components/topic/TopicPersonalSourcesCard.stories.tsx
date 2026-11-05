import { TopicPersonalSourcesCard } from "@carlnotes/core/components/TopicPersonalSourcesCard"
import { TOPIC_PERSONAL_SOURCES_STORY } from "@carlnotes/core/lib/personalSourcesStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { PERSONAL_SOURCES_ELEMENTS } from "./personalSourcesElements"

// all readiness and capacity states use the browser's fixtures and exact composition
const meta = {
	title: "Topic/TopicPersonalSourcesCard",
	component: TopicPersonalSourcesCard,
	args: {
		elements: PERSONAL_SOURCES_ELEMENTS,
		personalSources: TOPIC_PERSONAL_SOURCES_STORY,
		isLoading: false,
		hasError: false,
		onRetry: () => {},
		children: null,
	},
	parameters: { webReference: "apps/web/src/components/topic/TopicPersonalSourcesCard.stories.tsx at 375px" },
} satisfies Meta<typeof TopicPersonalSourcesCard>
export default meta
type Story = StoryObj<typeof meta>
export const Ready: Story = {}
export const Rebuilding: Story = {
	args: {
		personalSources: {
			...TOPIC_PERSONAL_SOURCES_STORY,
			context: { ...TOPIC_PERSONAL_SOURCES_STORY.context, status: "pending" },
		},
	},
}
export const IncompleteCoverage: Story = {
	args: {
		personalSources: {
			...TOPIC_PERSONAL_SOURCES_STORY,
			context: { ...TOPIC_PERSONAL_SOURCES_STORY.context, hasIncompleteCoverage: true },
		},
	},
}
export const Budget: Story = {
	args: {
		personalSources: {
			...TOPIC_PERSONAL_SOURCES_STORY,
			context: { ...TOPIC_PERSONAL_SOURCES_STORY.context, status: "budget" },
		},
	},
}
export const Full: Story = { args: { personalSources: { ...TOPIC_PERSONAL_SOURCES_STORY, sourceCount: 10 } } }
export const Empty: Story = {
	args: {
		personalSources: {
			...TOPIC_PERSONAL_SOURCES_STORY,
			sources: [],
			sourceCount: 0,
			context: { status: "empty", activatedAt: null, hasIncompleteCoverage: false },
		},
	},
}
export const Loading: Story = { args: { personalSources: undefined, isLoading: true } }
export const Failed: Story = { args: { personalSources: undefined, hasError: true } }
