// the top ten on its card with the app's rows and the web stories' names: the topics by visitors, and a podcast top ten
// under Both with each bar split into podcast and film plays
import { STORY_PODCAST_DASHBOARD, STORY_TOPIC_SERIES } from "@carlnotes/core/lib/dashboardStories"
import { toChartSeriesColors } from "@carlnotes/nightshift/chartTheme"
import type { Meta, StoryObj } from "@storybook/react-native"
import { withThemeSeriesColors } from "../../../.rnstorybook/seriesColorsDecorator"
import { DashboardBarChart } from "./DashboardBarChart"

const meta = {
	title: "Dashboard/DashboardBarChart",
	component: DashboardBarChart,
	parameters: { webReference: "apps/web/src/components/dashboard/DashboardBarChart.tsx at 375px", surface: "card" },
	decorators: [withThemeSeriesColors],
	args: {
		data: STORY_TOPIC_SERIES.bars,
		playFormat: null,
		seriesColors: toChartSeriesColors("light"),
		onItemPress: () => {},
		onPointFocus: () => {},
	},
} satisfies Meta<typeof DashboardBarChart>

export default meta
type Story = StoryObj<typeof meta>

/** The top ten topics by visitors, largest on top. */
export const TopTen: Story = {}

/** A podcast top ten under Both, each bar split into podcast plays and film plays. */
export const PodcastAndFilmPlays: Story = {
	args: { data: STORY_PODCAST_DASHBOARD.series?.bars ?? [], playFormat: "both" },
}
