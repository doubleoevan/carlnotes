import type { Meta, StoryObj } from "@storybook/react-native"
import { ScrollView } from "react-native"
import { STORY_SCAN_SOURCE_RESULTS } from "@/components/topic/topicPageStories"
import { SourceResultsChart } from "./SourceResultsChart"

// the web's mixed, expanded, earlier, and redacted states at phone width
const meta: Meta<typeof SourceResultsChart> = {
	title: "Common/SourceResultsChart",
	component: SourceResultsChart,
	parameters: { webReference: "apps/web/src/components/common/SourceResultsChart.tsx at 375px", surface: "card" },
	args: {
		sourceResults: STORY_SCAN_SOURCE_RESULTS.sources,
		scannedAt: "2026-10-22T12:00:00Z",
		earlierKeptCount: 0,
		earlierFoundCount: 0,
	},
	decorators: [
		(Story) => (
			<ScrollView className="w-full px-2">
				<Story />
			</ScrollView>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const Mixed: Story = {}
export const OwnerOpen: Story = { args: { initialOpenRowId: "web" } }
export const EarlierFindings: Story = {
	args: { earlierKeptCount: 4, earlierFoundCount: 12, initialOpenRowId: "earlier" },
}
export const VisitorOpen: Story = {
	args: {
		initialOpenRowId: "youtube",
		sourceResults: STORY_SCAN_SOURCE_RESULTS.sources.map((row) =>
			row.status === "failed" ? { ...row, costDollars: null, reason: null } : { ...row, costDollars: null },
		),
	},
}
export const Empty: Story = { args: { sourceResults: [] } }
