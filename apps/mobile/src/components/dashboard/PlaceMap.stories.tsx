// the map on its card with the app's react-native-maps and the web stories' names: nearby places share one pin with
// their count, and a map with no visitors yet still draws the world
import { STORY_DASHBOARD_PINS } from "@carlnotes/core/lib/dashboardStories"
import { toChartSeriesColors } from "@carlnotes/nightshift/chartTheme"
import type { Meta, StoryObj } from "@storybook/react-native"
import { withThemeSeriesColors } from "../../../.rnstorybook/seriesColorsDecorator"
import { PlaceMap } from "./PlaceMap"

const meta = {
	title: "Dashboard/PlaceMap",
	component: PlaceMap,
	parameters: { webReference: "apps/web/src/components/dashboard/PlaceMap.stories.tsx at 375px", surface: "card" },
	decorators: [withThemeSeriesColors],
	args: {
		data: STORY_DASHBOARD_PINS,
		playFormat: null,
		seriesColors: toChartSeriesColors("light"),
		onItemPress: () => {},
		onPointFocus: () => {},
	},
} satisfies Meta<typeof PlaceMap>

export default meta
type Story = StoryObj<typeof meta>

/** The pins in Paris, Berlin, and San Francisco, with the rest of each country. */
export const Pins: Story = {}

/** A map with no visitors yet, which still draws the world. */
export const NoPins: Story = { args: { data: [] } }
