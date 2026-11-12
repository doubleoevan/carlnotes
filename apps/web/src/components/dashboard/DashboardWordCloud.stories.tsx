// the Dashboard's word cloud on its card: the words of the most visited titles, heaviest in the middle

import { STORY_TOPIC_SERIES } from "@carlnotes/core/lib/dashboardStories"
import { toChartSeriesColors } from "@carlnotes/nightshift/chartTheme"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { withThemeSeriesColors } from "../../../.storybook/seriesColorsDecorator"
import { DashboardWordCloud } from "./DashboardWordCloud"

const meta = {
	title: "Dashboard/Word cloud",
	component: DashboardWordCloud,
	parameters: { surface: "card" },
	decorators: [withThemeSeriesColors],
	args: {
		data: STORY_TOPIC_SERIES.words,
		playFormat: null,
		seriesColors: toChartSeriesColors("light"),
		onItemPress: fn(),
		onPointFocus: fn(),
	},
} satisfies Meta<typeof DashboardWordCloud>

export default meta
type Story = StoryObj<typeof meta>

/** Ten words sized by the visitors of the items whose titles hold them. */
export const Words: Story = {}
