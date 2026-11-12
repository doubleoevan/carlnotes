// the word cloud on its card with the app's svg words and the web stories' names: the words of the most visited
// titles, heaviest in the middle
import { STORY_TOPIC_SERIES } from "@carlnotes/core/lib/dashboardStories"
import { toChartSeriesColors } from "@carlnotes/nightshift/chartTheme"
import type { Meta, StoryObj } from "@storybook/react-native"
import { withThemeSeriesColors } from "../../../.rnstorybook/seriesColorsDecorator"
import { DashboardWordCloud } from "./DashboardWordCloud"

const meta = {
	title: "Dashboard/DashboardWordCloud",
	component: DashboardWordCloud,
	parameters: {
		webReference: "apps/web/src/components/dashboard/DashboardWordCloud.stories.tsx at 375px",
		surface: "card",
	},
	decorators: [withThemeSeriesColors],
	args: {
		data: STORY_TOPIC_SERIES.words,
		playFormat: null,
		seriesColors: toChartSeriesColors("light"),
		onItemPress: () => {},
		onPointFocus: () => {},
	},
} satisfies Meta<typeof DashboardWordCloud>

export default meta
type Story = StoryObj<typeof meta>

/** Ten words sized by the visitors of the items whose titles hold them. */
export const Words: Story = {}
