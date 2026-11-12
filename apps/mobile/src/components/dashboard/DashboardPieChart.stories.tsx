// the pie on its card with the app's donut and the web stories' names: each topic's share with Other for the rest
import { STORY_TOPIC_SERIES } from "@carlnotes/core/lib/dashboardStories"
import { toChartSeriesColors } from "@carlnotes/nightshift/chartTheme"
import type { Meta, StoryObj } from "@storybook/react-native"
import { withThemeSeriesColors } from "../../../.rnstorybook/seriesColorsDecorator"
import { DashboardPieChart } from "./DashboardPieChart"

const meta = {
	title: "Dashboard/DashboardPieChart",
	component: DashboardPieChart,
	parameters: { webReference: "apps/web/src/components/dashboard/DashboardPieChart.tsx at 375px", surface: "card" },
	decorators: [withThemeSeriesColors],
	args: {
		data: STORY_TOPIC_SERIES.slices,
		playFormat: null,
		seriesColors: toChartSeriesColors("light"),
		onItemPress: () => {},
		onPointFocus: () => {},
	},
} satisfies Meta<typeof DashboardPieChart>

export default meta
type Story = StoryObj<typeof meta>

/** Each topic's share with Other for the rest. */
export const Share: Story = {}
