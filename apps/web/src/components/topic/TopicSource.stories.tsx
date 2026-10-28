import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { useState } from "react"
import { expect, userEvent, within } from "storybook/test"
import { TopicDefaultSource, TopicSource } from "./TopicSource"

// exercise the same source rows in both Nightshift themes
const meta = {
	title: "Topic/TopicSource",
	component: TopicSource,
	args: { sourceKind: "rss", summary: "example.com", onRemoveTopicSource: () => {} },
	decorators: [
		(Story) => (
			<div className="w-full max-w-sm">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof TopicSource>
export default meta
type Story = StoryObj<typeof meta>

export const CustomSource: Story = {}
export const Screening: Story = { args: { screeningMessage: "checking" } }
export const DefaultSource: Story = {
	render: () => <DefaultSourceStory />,
	play: async ({ canvasElement }) => {
		// remove and restore the source without changing its label or summary
		const canvas = within(canvasElement)
		await userEvent.click(canvas.getByRole("button", { name: "Remove web source" }))
		await expect(canvas.queryByText("Let Carl crawl")).not.toBeInTheDocument()
		await userEvent.click(canvas.getByRole("button", { name: "+ web" }))
		await expect(canvas.getByText("Let Carl crawl")).toBeVisible()
	},
}
export const DefaultSourceOff: Story = { render: () => <DefaultSourceStory isInitiallyOn={false} /> }

// keep toggles local so previews never change a topic
function DefaultSourceStory({ isInitiallyOn = true }: { isInitiallyOn?: boolean }) {
	const [isOn, setIsOn] = useState(isInitiallyOn)
	return (
		<TopicDefaultSource
			label="web"
			summary="Let Carl crawl"
			isOn={isOn}
			onTurnOn={() => setIsOn(true)}
			onTurnOff={() => setIsOn(false)}
		/>
	)
}
