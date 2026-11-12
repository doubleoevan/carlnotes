// the decorator a chart story uses: the story at the frame's full width, its series colors in the toggle's theme
import { toChartSeriesColors } from "@carlnotes/nightshift/chartTheme"
import type { Decorator } from "@storybook/react-native"
import { View } from "react-native"
import { toStoryTheme } from "./preview"

/**
 * Renders the story at the frame's full width, with the series colors of the toggle's theme in place of its
 * seriesColors arg.
 */
export const withThemeSeriesColors: Decorator = (Story, { args, globals }) => (
	<View className="w-full">
		{Story({ args: { ...args, seriesColors: toChartSeriesColors(toStoryTheme(globals)) } })}
	</View>
)
