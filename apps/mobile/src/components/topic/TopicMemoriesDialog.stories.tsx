import type { TopicMemoriesClient } from "@carlnotes/core/hooks/useTopicMemories"
import { toTopicMemoryStoryPage } from "@carlnotes/core/lib/topicMemoryStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { type ComponentProps, useState } from "react"
import { TopicMemoriesDialog } from "./TopicMemoriesDialog"

const meta: Meta<typeof TopicMemoriesDialog> = {
	title: "Topic/TopicMemoriesDialog",
	component: TopicMemoriesDialog,
	parameters: { webReference: "Topic/TopicMemoriesDialog at 375px" },
	args: { topicId: "journal-story", entryCount: 3, topicMemoryCount: 6 },
}
export default meta
type Story = StoryObj<typeof meta>

export const Owner: Story = {
	args: { canRateTopicMemories: true },
	render: (args) => <JournalStory key="owner" {...args} />,
}

export const ReadOnly: Story = {
	render: (args) => <JournalStory key="read-only" {...args} />,
}

export const Empty: Story = {
	args: { entryCount: 0, topicMemoryCount: 0 },
	render: (args) => <JournalStory key="empty" {...args} />,
}

// keep both paging and saved feedback local to the mounted story
function JournalStory(args: ComponentProps<typeof TopicMemoriesDialog>) {
	const [queryClient] = useState(() => new QueryClient())
	const [client] = useState<TopicMemoriesClient>(() => {
		const feedback = new Map<string, Parameters<TopicMemoriesClient["rate"]>[0]["feedback"]>()
		return {
			read: async ({ page }) => {
				const result = toTopicMemoryStoryPage({
					page,
					canRate: args.canRateTopicMemories ?? false,
					isEmpty: args.topicMemoryCount === 0,
				})
				return {
					...result,
					items: result.items.map((item) => {
						const saved = feedback.get(item.id)
						return saved ? { ...item, rating: saved.rating, note: saved.note ?? null } : item
					}),
				}
			},
			rate: async ({ topicMemoryId, feedback: vote }) => {
				feedback.set(topicMemoryId, vote)
				return { status: "saved" }
			},
		}
	})
	return (
		<QueryClientProvider client={queryClient}>
			<TopicMemoriesDialog {...args} client={client} />
		</QueryClientProvider>
	)
}
