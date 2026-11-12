// the Dashboard's trend on its card: the top topics' lines over 30 days

import { STORY_TOPIC_SERIES } from "@carlnotes/core/lib/dashboardStories"
import { toChartSeriesColors } from "@carlnotes/nightshift/chartTheme"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { withThemeSeriesColors } from "../../../.storybook/seriesColorsDecorator"
import { DashboardTrendChart } from "./DashboardTrendChart"

const meta = {
	title: "Dashboard/Trend chart",
	component: DashboardTrendChart,
	parameters: { surface: "card" },
	decorators: [withThemeSeriesColors],
	args: {
		data: STORY_TOPIC_SERIES.trends["30"] ?? { days: [], daysPerPoint: 1, lines: [] },
		playFormat: null,
		seriesColors: toChartSeriesColors("light"),
		onItemPress: fn(),
		onPointFocus: fn(),
	},
} satisfies Meta<typeof DashboardTrendChart>

export default meta
type Story = StoryObj<typeof meta>

/** The trend of the top topics over 30 days. */
export const Trend: Story = {}
