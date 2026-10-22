// the shimmering "Carl is ___" line shown while carl works on a reply, a scan, or source suggestions
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { ThinkingLine } from "./ThinkingLine"

const meta = {
	title: "Common/ThinkingLine",
	component: ThinkingLine,
	argTypes: {
		className: { control: "text" },
	},
} satisfies Meta<typeof ThinkingLine>

export default meta
type Story = StoryObj<typeof meta>

// the line with no class of its own, which takes its size and color from its parent, as carl's thinking bubble in a
// chat gives it
export const Default: Story = {}

// the line in a scan history row while a scan runs, truncated to the row's width
export const ScanHistoryRow: Story = {
	args: { className: "min-w-0 flex-1 truncate text-xs" },
	render: (args) => (
		<div className="flex w-48 items-center gap-2">
			<ThinkingLine {...args} />
		</div>
	),
}

// the line where the Recommend button was while carl suggests sources
export const SourceSuggestions: Story = { args: { className: "text-sm" } }
