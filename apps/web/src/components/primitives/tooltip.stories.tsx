// the tooltip primitive: a label in the primary fill that shows beside its trigger on hover or keyboard focus
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { Copy } from "lucide-react"
import type * as React from "react"
import { fn } from "storybook/test"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { Badge } from "./badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

// the root's props, and where the label sits against its trigger
type TooltipStoryArgs = React.ComponentProps<typeof Tooltip> &
	Pick<React.ComponentProps<typeof TooltipContent>, "side" | "align">

// a url source's summary, longer than its row shows
const LONG_SOURCE_SUMMARY = "https://example.com/blog/2026/10/long-context-retrieval-benchmarks-at-a-million-tokens"

const meta = {
	title: "Primitives/Tooltip",
	component: Tooltip,
	args: { defaultOpen: true, delayDuration: 200, side: "top", align: "center", onOpenChange: fn() },
	argTypes: {
		defaultOpen: { control: "boolean" },
		delayDuration: { control: { type: "number", min: 0, step: 100 } },
		side: { control: "inline-radio", options: ["top", "right", "bottom", "left"] },
		align: { control: "inline-radio", options: ["start", "center", "end"] },
		onOpenChange: { control: false },
		children: { control: false },
	},
	parameters: {
		// the trigger sits in the middle, so the label has room on every side
		layout: "centered",
		// the copy button and the source rows sit in panels and dialogs, on the card fill
		surface: "card",
		// an open label floats over the page, so each story on the docs page gets its own frame
		docs: toOwnFrameDocs(240),
	},
	// the copy button's tile named by the label it shows, always visible here instead of only on hover
	render: ({ side, align, ...args }) => (
		<Tooltip {...args}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label="Copy Markdown for AI"
					className="bg-card/90 text-muted-foreground hover:text-foreground grid size-7 place-items-center rounded-md border shadow-raised"
				>
					<Copy className="size-3.5" />
				</button>
			</TooltipTrigger>
			<TooltipContent side={side} align={align}>
				Copy Markdown for AI
			</TooltipContent>
		</Tooltip>
	),
} satisfies Meta<TooltipStoryArgs>

export default meta
type Story = StoryObj<typeof meta>

// the label open above its trigger
export const Open: Story = {}

// the label open below its trigger
export const Bottom: Story = { args: { side: "bottom" } }

// the label closed until a hover or a keyboard focus on the trigger
export const OnHover: Story = { args: { defaultOpen: false } }

// a long source summary on a row that cuts it short, which wraps at the label's width and breaks inside the url
export const LongText: Story = {
	render: ({ side, align, ...args }) => (
		// a custom source row at a dialog's width on a phone
		<div className="flex items-center gap-2 text-sm" style={{ width: 288 }}>
			<Badge variant="outline" className="shrink-0">
				url
			</Badge>
			<Tooltip {...args}>
				<TooltipTrigger asChild>
					<span className="text-muted-foreground min-w-0 flex-1 truncate">{LONG_SOURCE_SUMMARY}</span>
				</TooltipTrigger>
				<TooltipContent side={side} align={align} className="max-w-72 wrap-anywhere">
					{LONG_SOURCE_SUMMARY}
				</TooltipContent>
			</Tooltip>
		</div>
	),
}
