import type { Meta, StoryObj } from "@storybook/react-native"
import { TopicSources } from "./TopicSources"

// default and custom sources retain the web's labels and source marks
const meta = {
	title: "Topic/TopicSources",
	component: TopicSources,
	parameters: { webReference: "apps/web/src/components/topic/TopicInfo.tsx#TopicSourcesSection" },
	args: { sources: [] },
} satisfies Meta<typeof TopicSources>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Processing: Story = {
	args: {
		sources: [
			{
				id: "rss",
				sourceKind: "rss",
				summary: "Coffee news",
				value: "https://example.com/feed",
				status: "pending",
				error: null,
			},
		],
	},
}
