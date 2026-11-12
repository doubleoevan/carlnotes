// the list under a meter of what each cutoff stops, with a passed line struck through
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { MeterCutoffList } from "./MeterCutoffList"

const meta = {
	title: "Common/MeterCutoffList",
	component: MeterCutoffList,
	args: {
		cutoffRows: [
			{
				key: "podcastEpisodes",
				label: "$65",
				line: "Free users' podcast episodes after first are skipped.",
				isPassed: true,
			},
			{
				key: "scheduledScans",
				label: "$100",
				line: "Free users' scheduled scans stop and first scans wait.",
				isPassed: false,
			},
		],
	},
	argTypes: { cutoffRows: { control: "object" } },
	parameters: { surface: "card" },
} satisfies Meta<typeof MeterCutoffList>

export default meta
type Story = StoryObj<typeof meta>

// one cutoff passed and one ahead
export const Default: Story = {}
