// the popover primitive: a trigger and the panel it opens, with a scrolling body and an optional ✕
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import type * as React from "react"
import { fn } from "storybook/test"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { InfoSection } from "@/components/topic/TopicInfo"
import { NumberedTopicFindingList, ScrollNote } from "@/components/topic/TopicScanRecap"
import { POPOVER_HEADING_CLASS, POPOVER_PANEL_CLASS } from "@/lib/styleClasses"
import { toStoryTopicFinding } from "../../../.storybook/fixtures/topicFeed"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "./popover"

// the root's props, and where the panel sits against its trigger
type PopoverStoryArgs = React.ComponentProps<typeof Popover> &
	Pick<React.ComponentProps<typeof PopoverContent>, "side" | "align">

// the topic's prompt, the first section of its note
const TOPIC_PROMPT =
	"Track release notes, benchmarks, and long reads on LLM tooling: local runtimes, eval harnesses, and tracing."

// the latest scan's recap, above its findings
const SCAN_NOTE = "A faster local runtime for small models led the scan, with two eval tools close behind."

// the latest scan's five kept findings, each a title and why Carl kept it
const TOPIC_FINDINGS = [
	{
		title: "A local runtime halves model load time",
		relevanceExplanation: "The release notes measure cold starts on three laptops.",
	},
	{
		title: "An eval harness adds trace replay",
		relevanceExplanation: "It replays a failed run step by step, so a flaky eval is easy to find.",
	},
	{
		title: "Long context benchmarks at a million tokens",
		relevanceExplanation: "Retrieval holds up past 500k tokens, and the cost doubles.",
	},
	{
		title: "A tracing view for tool calls",
		relevanceExplanation: "It shows each tool call's latency beside the model's own.",
	},
	{
		title: "Quantized models on a phone",
		relevanceExplanation: "A 4-bit model replies in under a second on a recent phone.",
	},
].map(({ title, relevanceExplanation }, index) =>
	toStoryTopicFinding({
		findingId: `finding-${index + 1}`,
		resourceId: `resource-${index + 1}`,
		url: `https://example.com/blog/finding-${index + 1}`,
		title,
		viewerCount: 0,
		relevanceScore: 0.9,
		relevanceExplanation,
	}),
)

const meta = {
	title: "Primitives/Popover",
	component: Popover,
	args: { defaultOpen: true, modal: false, side: "bottom", align: "start", onOpenChange: fn() },
	argTypes: {
		defaultOpen: { control: "boolean" },
		modal: { control: "boolean" },
		side: { control: "inline-radio", options: ["top", "right", "bottom", "left"] },
		align: { control: "inline-radio", options: ["start", "center", "end"] },
		onOpenChange: { control: false },
		children: { control: false },
	},
	parameters: {
		// the trigger sits in the middle, so the panel has room on every side
		layout: "centered",
		// an open panel floats over the page, so each story on the docs page gets its own frame
		docs: toOwnFrameDocs(420),
	},
	// the topic's note panel with its prompt, which centers as a sheet on a phone
	render: ({ side, align, ...args }) => (
		<TopicNotePanel {...args} side={side} align={align}>
			<InfoSection label="Carl's Prompt">{TOPIC_PROMPT}</InfoSection>
		</TopicNotePanel>
	),
} satisfies Meta<PopoverStoryArgs>

export default meta
type Story = StoryObj<typeof meta>

// a topic's note panel, open below its note icon
export const InfoPanel: Story = {}

// a note taller than the space below its trigger, which scrolls inside the panel while the shell stays put
export const LongContent: Story = {
	render: ({ side, align, ...args }) => (
		<TopicNotePanel {...args} side={side} align={align}>
			<InfoSection label="Carl's Prompt">{TOPIC_PROMPT}</InfoSection>
			{/* the recap and the numbered findings, in their own scroll box */}
			<InfoSection label={`Carl's Top ${TOPIC_FINDINGS.length}`}>
				<ScrollNote note={SCAN_NOTE}>
					<NumberedTopicFindingList findings={TOPIC_FINDINGS} />
				</ScrollNote>
			</InfoSection>
		</TopicNotePanel>
	),
}

// the note icon and the wide panel it opens, with the ✕ and the centered title above the given sections
function TopicNotePanel({ side, align, children, ...popoverProps }: PopoverStoryArgs & { children: React.ReactNode }) {
	return (
		<Popover {...popoverProps}>
			<PopoverTrigger
				className="relative grid size-7 shrink-0 place-items-center hover:opacity-75"
				aria-label="Topic details"
			>
				<NoteIcon />
			</PopoverTrigger>
			<PopoverContent side={side} align={align} className={POPOVER_PANEL_CLASS}>
				<PopoverCloseButton />
				<h2 className={POPOVER_HEADING_CLASS}>Topic roast</h2>
				<div>{children}</div>
			</PopoverContent>
		</Popover>
	)
}
