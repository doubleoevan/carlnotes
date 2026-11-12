// a meter's progress bar: one segment, several segments, and room for circles above it
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { MeterBar } from "./MeterBar"
import { MeterMarker } from "./MeterMarker"

const meta = {
	title: "Common/MeterBar",
	component: MeterBar,
	args: { segments: [{ key: "spend", colorClass: "bg-primary", widthPercent: 40 }] },
	argTypes: { segments: { control: "object" }, hasMarkers: { control: "boolean" } },
	parameters: { surface: "card" },
} satisfies Meta<typeof MeterBar>

export default meta
type Story = StoryObj<typeof meta>

// one segment at 40 percent
export const Default: Story = {}

// scans, podcast episodes, and chat as segments of one bar
export const Segments: Story = {
	args: {
		segments: [
			{ key: "scans", colorClass: "bg-primary", widthPercent: 30 },
			{ key: "podcastEpisodes", colorClass: "bg-spend-podcast-episode", widthPercent: 20 },
			{ key: "chat", colorClass: "bg-spend-chat", widthPercent: 10 },
		],
	},
}

// a passed circle and one still ahead
export const WithMarkers: Story = {
	args: {
		hasMarkers: true,
		children: [
			<MeterMarker key="passed" percent={25} label="25%" ariaLabel="At 25%" isPassed>
				Passed
			</MeterMarker>,
			<MeterMarker key="ahead" percent={75} label="75%" ariaLabel="At 75%" isPassed={false}>
				Ahead
			</MeterMarker>,
		],
	},
}
