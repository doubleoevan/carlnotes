// the decorator a chart story uses so its series colors follow the toolbar's theme, as a page's follow the color mode
import { toChartSeriesColors } from "@carlnotes/nightshift/chartTheme"
import type { Decorator } from "@storybook/tanstack-react"
import { isDarkToolbarTheme } from "./useToolbarTheme"

/**
 * Renders the story with the series colors of the toolbar's theme in place of its seriesColors arg.
 */
export const withThemeSeriesColors: Decorator = (Story, { args, globals }) =>
	Story({ args: { ...args, seriesColors: toChartSeriesColors(isDarkToolbarTheme(globals) ? "dark" : "light") } })
