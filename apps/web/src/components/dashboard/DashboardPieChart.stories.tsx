// the Dashboard's pie on its card: each topic's share with Other

import { STORY_TOPIC_SERIES } from "@carlnotes/core/lib/dashboardStories"
import { toChartSeriesColors } from "@carlnotes/nightshift/chartTheme"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { withThemeSeriesColors } from "../../../.storybook/seriesColorsDecorator"
import { DashboardPieChart } from "./DashboardPieChart"

const meta = {
	title: "Dashboard/Pie chart",
	component: DashboardPieChart,
	parameters: { surface: "card" },
	decorators: [withThemeSeriesColors],
	args: {
		data: STORY_TOPIC_SERIES.slices,
		playFormat: null,
		seriesColors: toChartSeriesColors("light"),
		onItemPress: fn(),
		onPointFocus: fn(),
	},
} satisfies Meta<typeof DashboardPieChart>

export default meta
type Story = StoryObj<typeof meta>

/** Each topic's share with Other for the rest. */
export const Share: Story = {}
