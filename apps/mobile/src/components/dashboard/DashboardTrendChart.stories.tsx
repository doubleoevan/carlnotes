// the trend on its card with the app's lines and the web stories' names: the top topics over 30 days
import { STORY_TOPIC_SERIES } from "@carlnotes/core/lib/dashboardStories"
import { toChartSeriesColors } from "@carlnotes/nightshift/chartTheme"
import type { Meta, StoryObj } from "@storybook/react-native"
import { withThemeSeriesColors } from "../../../.rnstorybook/seriesColorsDecorator"
import { DashboardTrendChart } from "./DashboardTrendChart"

const meta = {
	title: "Dashboard/DashboardTrendChart",
	component: DashboardTrendChart,
	parameters: { webReference: "apps/web/src/components/dashboard/DashboardTrendChart.tsx at 375px", surface: "card" },
	decorators: [withThemeSeriesColors],
	args: {
		data: STORY_TOPIC_SERIES.trends["30"] ?? { days: [], daysPerPoint: 1, lines: [] },
		playFormat: null,
		seriesColors: toChartSeriesColors("light"),
		onItemPress: () => {},
		onPointFocus: () => {},
	},
} satisfies Meta<typeof DashboardTrendChart>

export default meta
type Story = StoryObj<typeof meta>

/** The trend of the top topics over 30 days. */
export const Trend: Story = {}
