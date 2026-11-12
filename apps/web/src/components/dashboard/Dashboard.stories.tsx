// a Dashboard page's body with the web's elements: the accordion of chart sections in four rows, the top ten with Carl's
// paragraph in its card, the pie beside the word cloud, the trend, and the map, every section open
import { Dashboard } from "@carlnotes/core/components/Dashboard"
import { DASHBOARD_CHART_TITLES, dashboardChartNames } from "@carlnotes/core/lib/dashboardCharts"
import {
	STORY_DASHBOARD_USER,
	STORY_PODCAST_DASHBOARD,
	STORY_TOPIC_DASHBOARD,
} from "@carlnotes/core/lib/dashboardStories"
import { toChartSeriesColors } from "@carlnotes/nightshift/chartTheme"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, within } from "storybook/test"
import { withThemeSeriesColors } from "../../../.storybook/seriesColorsDecorator"
import { toWebDashboardElements } from "./dashboardElements"
import { WEB_DASHBOARD_CHART_RENDERERS } from "./webDashboardChartRenderers"

// the web's elements
const ELEMENTS = toWebDashboardElements(WEB_DASHBOARD_CHART_RENDERERS)
const meta = {
	title: "Dashboard/Dashboard",
	component: Dashboard,
	parameters: { surface: "page" },
	decorators: [withThemeSeriesColors],
	args: {
		dashboardKind: "topicDashboard",
		subjectId: STORY_DASHBOARD_USER.userId,
		hasFullAccess: false,
		isOwner: false,
		initialDashboard: STORY_TOPIC_DASHBOARD,
		seriesColors: toChartSeriesColors("light"),
		captureVisitEvent: fn(),
		onItemPress: fn(),
		elements: ELEMENTS,
	},
} satisfies Meta<typeof Dashboard>

export default meta
type Story = StoryObj<typeof meta>

/** Topic Dashboard as a visitor reads it, with every chart section open and an item select at each card's top right. */
export const TopicDashboard: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		for (const chartName of dashboardChartNames) {
			const sectionButton = canvas.getByRole("button", { name: DASHBOARD_CHART_TITLES[chartName] })
			await expect(sectionButton).toHaveAttribute("aria-expanded", "true")
		}
		await expect(canvas.getByRole("combobox", { name: "Trend range" })).toBeVisible()
	},
}

/** Podcast Dashboard, whose charts switch between Podcasts, Films, and Both. */
export const PodcastDashboard: Story = {
	args: { dashboardKind: "podcastDashboard", initialDashboard: STORY_PODCAST_DASHBOARD },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.getAllByRole("group", { name: /format/ })).toHaveLength(5)
	},
}

/** A Dashboard not built yet: each chart's empty card. The map still draws. */
export const NoVisitorsYet: Story = {
	args: {
		initialDashboard: {
			...STORY_TOPIC_DASHBOARD,
			paragraph: null,
			series: { bars: [], slices: [], trends: {}, words: [], pins: [] },
		},
	},
}
