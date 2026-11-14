// the Dashboard map on its card: with no Google Maps key it draws the outline map, where nearby places share one pin
// with their count, the way the MCP view and a self-hosted site draw it

import { fetchDashboardMapSettings } from "@carlnotes/client/dashboardClient"
import { DASHBOARD_CHART_IMAGE_LABELS } from "@carlnotes/core/lib/dashboardCharts"
import { STORY_DASHBOARD_PINS } from "@carlnotes/core/lib/dashboardStories"
import { toChartSeriesColors } from "@carlnotes/nightshift/chartTheme"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked, waitFor, within } from "storybook/test"
import { OutlineMap } from "./OutlineMap"
import { PlaceMap } from "./PlaceMap"

// the props both maps take
const MAP_ARGS = {
	data: STORY_DASHBOARD_PINS,
	playFormat: null,
	seriesColors: toChartSeriesColors("light"),
	onItemPress: fn(),
	onPointFocus: fn(),
}

const meta = {
	title: "Dashboard/Map",
	component: PlaceMap,
	parameters: { surface: "card" },
	args: MAP_ARGS,
} satisfies Meta<typeof PlaceMap>

export default meta
type Story = StoryObj<typeof meta>

/** The page's map with no Google Maps key, which draws the outline map. */
export const WithoutGoogleMapsKey: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(await canvas.findByRole("img", { name: DASHBOARD_CHART_IMAGE_LABELS.map })).toBeVisible()
	},
}

/** The page's map with a Google Maps key and Map ID, whose box keeps its height around Google's map. */
export const WithGoogleMapsKey: Story = {
	beforeEach: () => {
		mocked(fetchDashboardMapSettings).mockResolvedValue({ apiKey: "story-key", mapId: "story-map-id" })
	},
	play: async ({ canvasElement }) => {
		await waitFor(() => {
			const mapBox = canvasElement.querySelector("[data-place-map]")
			expect(mapBox?.getBoundingClientRect().height).toBeGreaterThan(0)
		})
	},
}

/** The outline map alone, as the MCP view draws it. */
export const Outline: Story = {
	render: () => <OutlineMap {...MAP_ARGS} />,
}

/** A map with no visitors yet, which still draws the world. */
export const NoPins: Story = {
	render: () => <OutlineMap {...MAP_ARGS} data={[]} />,
}
