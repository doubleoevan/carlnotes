// the badge primitive: a small pill for a tag or a source kind, in each of its variants
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { Badge } from "./badge"

const meta = {
	title: "Primitives/Badge",
	component: Badge,
	args: { children: "deep learning", variant: "secondary" },
	argTypes: {
		variant: { control: "inline-radio", options: ["default", "secondary", "outline"] },
		asChild: { control: false },
	},
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

// the quiet fill every tag in the app uses
export const Secondary: Story = {}

// the highlight fill, the primitive's default, which no badge in the app uses
export const Default: Story = { args: { variant: "default" } }

// a border and no fill, as the source kind at the start of a source row in the edit topic dialog
export const Outline: Story = {
	args: { variant: "outline", children: "rss" },
	parameters: { surface: "card" },
	render: (args) => (
		<div className="flex items-center gap-2 text-sm">
			<Badge {...args} className="shrink-0" />
			<span className="text-muted-foreground min-w-0 flex-1 truncate">example.com</span>
		</div>
	),
}
