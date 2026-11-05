import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { Coffee } from "lucide-react"
import { SearchResultRow } from "./SearchResultRow"
import { TopicSearchResultDetails } from "./TopicSearchResultDetails"

const meta = {
	title: "Search/SearchResultRow",
	component: SearchResultRowStory,
	args: { rank: 1, selected: false },
} satisfies Meta<typeof SearchResultRowStory>
export default meta
type Story = StoryObj<typeof meta>
export const Ranked: Story = {}
export const Selected: Story = { args: { rank: undefined, selected: true } }

// The story builds its checkbox and badge from serializable selection controls.
function SearchResultRowStory({ rank, selected }: { rank?: number; selected?: boolean }) {
	return (
		<SearchResultRow
			rank={rank}
			leading={
				selected ? (
					<input
						type="checkbox"
						defaultChecked
						aria-label="Select AI gone rogue"
						className="mt-0.5 size-4 accent-primary"
					/>
				) : (
					<Coffee className="text-muted-foreground mt-0.5 size-4" />
				)
			}
			title={<span className="text-sm font-semibold">AI gone rogue</span>}
			details={<TopicSearchResultDetails viewerCount={11} subscriberCount={8} />}
			action={
				selected && (
					<span className="bg-secondary text-secondary-foreground rounded-full px-2 py-1 text-xs font-semibold">
						Best match
					</span>
				)
			}
		/>
	)
}
