// the persona credit: who inspired Carl, with links to his company, videos, and school
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { SECTION_LABEL_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { Attribution } from "./Attribution"

const meta = {
	title: "Layout/Attribution",
	component: Attribution,
	argTypes: {
		className: { control: "text" },
	},
	// the hero's persona popover, the one place the app shows the credit: the popover's shell at its width and text
	// size, with the "The Real Carl" section label over the credit
	decorators: [
		(Story) => (
			<div className="bg-popover text-popover-foreground w-80 rounded-md border p-4 text-sm shadow-lift">
				<div className={cn(SECTION_LABEL_CLASS, "mb-1 text-center")}>The Real Carl</div>
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof Attribution>

export default meta
type Story = StoryObj<typeof meta>

// the hero popover's credit, with the call to action centered on its own line
export const InPopover: Story = {}
