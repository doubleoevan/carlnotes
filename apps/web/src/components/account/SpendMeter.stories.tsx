import {
	SPEND_METER_STORY_ACTIVITY,
	SPEND_METER_STORY_NARROW_ACTIVITY,
} from "@carlnotes/core/lib/spendMeterStoryFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { SpendMeter } from "./SpendMeter"

// match the native budget stories with the same cutoff and spend fixtures
const meta = {
	title: "Account/SpendMeter",
	component: SpendMeter,
	args: SPEND_METER_STORY_ACTIVITY,
} satisfies Meta<typeof SpendMeter>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const PassedCheckpoints: Story = { args: { scanSpendCents: 171 } }
export const Spent: Story = { args: { scanSpendCents: 300 } }
export const NoCheckpoints: Story = { args: { monthlyBudgetCutoffs: [] } }
// use the same narrow card and spend as mobile when checking legend wrapping
export const NarrowLegend: Story = {
	args: SPEND_METER_STORY_NARROW_ACTIVITY,
	decorators: [
		(Story) => (
			<div style={{ width: 296 }}>
				<Story />
			</div>
		),
	],
	play: async ({ canvasElement }) => {
		// shared color classes must reach the stylesheet for both the bar and the legend
		const podcastSegments = canvasElement.querySelectorAll(".bg-spend-podcast-episode")
		const chatSegments = canvasElement.querySelectorAll(".bg-spend-chat")
		await expect(podcastSegments).toHaveLength(2)
		await expect(chatSegments).toHaveLength(2)
		for (const segment of [...Array.from(podcastSegments), ...Array.from(chatSegments)]) {
			await expect(getComputedStyle(segment).backgroundColor).not.toBe("rgba(0, 0, 0, 0)")
		}
	},
}
