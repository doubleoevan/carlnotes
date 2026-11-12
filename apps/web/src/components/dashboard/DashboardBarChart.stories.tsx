// the Dashboard's bar chart on its card: the top ten, and a podcast top ten split into podcast and film plays

import { STORY_PODCAST_DASHBOARD, STORY_TOPIC_SERIES } from "@carlnotes/core/lib/dashboardStories"
import { toChartSeriesColors } from "@carlnotes/nightshift/chartTheme"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { withThemeSeriesColors } from "../../../.storybook/seriesColorsDecorator"
import { DashboardBarChart } from "./DashboardBarChart"

const meta = {
	title: "Dashboard/Bar chart",
	component: DashboardBarChart,
	parameters: { surface: "card" },
	decorators: [withThemeSeriesColors],
	args: {
		data: STORY_TOPIC_SERIES.bars,
		playFormat: null,
		seriesColors: toChartSeriesColors("light"),
		onItemPress: fn(),
		onPointFocus: fn(),
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
