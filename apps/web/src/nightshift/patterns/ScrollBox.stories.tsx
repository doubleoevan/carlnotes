// the scroll box pattern: the thin scrollbar, the highlight scrollbar, no scrollbar, and the ScrollBox component
import type { PodcastEpisodeTranscriptBlock } from "@carlnotes/contracts/podcast"
import { PODCAST_EPISODE_SPEAKER_NAMES } from "@carlnotes/contracts/podcastEpisodes"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	Bold,
	Code,
	Heading1,
	Italic,
	Link,
	List,
	ListOrdered,
	Quote,
	Strikethrough,
	Underline,
} from "lucide-react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PodcastEpisodeTranscript } from "@/components/podcast/PodcastEpisodeTranscript"
import { ScrollBox } from "@/components/topic/TopicScanRecap"
import { CARD_CLASS, SEARCH_BAR_ICON_CLASS, STANDALONE_LINK_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"

// the scan note's paragraphs a vertical box overflows with
const SCAN_NOTE_PARAGRAPHS = [
	"Two findings cover evaluation harnesses, and one walks through caching prompts across a long chat.",
	"The rest are release notes from the tools the topic already follows, with the changes that matter called out.",
	"A Reddit thread asks which tracing tool holds up past a thousand requests a minute, and the answers disagree.",
	"Tomorrow's scan starts at 9:00 AM and reads the same Sources.",
]

// the topics a sideways strip overflows with
const STRIP_TOPICS = ["LLM tooling", "Rust async runtimes", "Edge databases", "Home espresso gear", "Vector search"]

// the note editor's formatting buttons, more than its strip fits on a phone
const FORMATTING_BUTTONS = [
	{ label: "Heading", Icon: Heading1 },
	{ label: "Bold", Icon: Bold },
	{ label: "Italic", Icon: Italic },
	{ label: "Underline", Icon: Underline },
	{ label: "Strikethrough", Icon: Strikethrough },
	{ label: "Align left", Icon: AlignLeft },
	{ label: "Align center", Icon: AlignCenter },
	{ label: "Align right", Icon: AlignRight },
	{ label: "Code", Icon: Code },
	{ label: "Link", Icon: Link },
	{ label: "Bulleted list", Icon: List },
	{ label: "Numbered list", Icon: ListOrdered },
	{ label: "Quote", Icon: Quote },
]

// the transcript's chapters, each under its title with the host's and the cohost's turns, the host first
const TRANSCRIPT_CHAPTERS: PodcastEpisodeTranscriptBlock[] = [
	{
		heading: "Three stacks, one task",
		turns: [
			"Three LLM tooling stacks ran the same retrieval task this week, and the numbers surprised me.",
			"Surprised how? I expected the biggest stack to win on accuracy and lose on cost.",
			"It won on accuracy by a hair. The middle stack streamed its first token twice as fast.",
			"So the speed people feel comes from streaming, not from the model.",
		],
	},
	{
		heading: "What teams use",
		turns: [
			"A Reddit thread asked which tracing tool holds up past a thousand requests a minute.",
			"And the answers disagreed, which tells you most teams never get that far.",
			"Two release notes from tools the topic follows changed how they cache prompts across a long chat.",
			"That one matters. A cached prompt cuts the cost of every follow-up question.",
		],
	},
	{
		heading: "Tomorrow's scan",
		turns: [
			"Tomorrow's scan starts at 9:00 AM and reads the same Sources.",
			"Then we'll know whether the middle stack keeps its lead on a second run.",
		],
	},
].map(({ heading, turns }) => ({
	heading,
	turns: turns.map((text, i) => ({
		speakerName: i % 2 === 0 ? PODCAST_EPISODE_SPEAKER_NAMES.host : PODCAST_EPISODE_SPEAKER_NAMES.cohost,
		text,
	})),
}))

/**
 * Renders a box whose content overflows, with one of the app's scrollbar treatments. Each box holds a link, so a
 * keyboard reaches its scrolling.
 */
function ScrollBoxPattern({ scrollbar }: { scrollbar: "thin" | "highlight" | "none" | "scrollBox" }) {
	// the thin scrollbar on the sideways scroll inside a table's card
	if (scrollbar === "thin") {
		return (
			<div className={CARD_CLASS}>
				<div className={TABLE_SCROLL_CLASS}>
					<p className="py-2 text-sm" style={{ whiteSpace: "nowrap", paddingInline: 16 }}>
						<TopicLinks />
					</p>
				</div>
			</div>
		)
	}

	// the highlight scrollbar on the podcast episode transcript card, once read more expands it
	if (scrollbar === "highlight") {
		return <PodcastEpisodeTranscript transcript={TRANSCRIPT_CHAPTERS} />
	}

	// the note editor's formatting strip, which scrolls sideways with no bar drawn. Tailwind does not scan this folder,
	// so the strip sets scrollbarWidth inline
	if (scrollbar === "none") {
		return (
			<div
				role="toolbar"
				aria-label="Formatting"
				className="bg-popover text-popover-foreground shadow-lift flex overflow-x-auto rounded-md border"
				style={{ scrollbarWidth: "none" }}
			>
				{FORMATTING_BUTTONS.map(({ label, Icon }) => (
					<button key={label} type="button" aria-label={label} className={SEARCH_BAR_ICON_CLASS}>
						<Icon className="size-4" />
					</button>
				))}
			</div>
		)
	}

	// the ScrollBox component: a bordered box with the highlight scrollbar and a copy button on its corner, in the
	// small text of the popover or card around every app scroll box
	return (
		<div className="text-sm">
			<ScrollBox copyMarkdown={SCAN_NOTE_PARAGRAPHS.join("\n\n")}>
				<ScanNoteParagraphs />
			</ScrollBox>
		</div>
	)
}

// the topics in one line, each a link
function TopicLinks() {
	return (
		<>
			{STRIP_TOPICS.map((topicName, i) => (
				<span key={topicName}>
					{i > 0 && " · "}
					<AnchorLink
						href={`https://example.com/${topicName.toLowerCase().replaceAll(" ", "-")}`}
						className={STANDALONE_LINK_CLASS}
					>
						{topicName}
					</AnchorLink>
				</span>
			))}
		</>
	)
}

// a linked finding, then the scan note's paragraphs, spaced like a scan recap
function ScanNoteParagraphs() {
	return (
		<>
			<p className="mb-3 last:mb-0">
				{"Carl read 42 pages on LLM tooling this morning and kept six. The strongest, "}
				<AnchorLink href="https://example.com/llm-tooling-compared" className="sentence-link">
					Three LLM tooling stacks, one retrieval task
				</AnchorLink>
				{", reports latency, cost, and accuracy for each stack."}
			</p>
			{SCAN_NOTE_PARAGRAPHS.map((noteParagraph) => (
				<p key={noteParagraph} className="mb-3 last:mb-0">
					{noteParagraph}
				</p>
			))}
		</>
	)
}

const meta = {
	title: "Patterns/ScrollBox",
	component: ScrollBoxPattern,
	args: { scrollbar: "thin" },
	argTypes: { scrollbar: { control: "inline-radio", options: ["thin", "highlight", "none", "scrollBox"] } },
	// a narrow column, so every box overflows
	decorators: [
		(Story) => (
			<div style={{ maxWidth: 320 }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof ScrollBoxPattern>

export default meta
type Story = StoryObj<typeof meta>

// THIN_SCROLLBAR_CLASS through TABLE_SCROLL_CLASS: a card's content scrolling sideways
export const ThinScrollbar: Story = {}

// HIGHLIGHT_SCROLLBAR_CLASS: the expanded podcast episode transcript scrolling down with the highlight scrollbar
export const HighlightScrollbar: Story = {
	args: { scrollbar: "highlight" },
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /read more/ }))
	},
}

// the scrollbar-none utility: the note editor's formatting strip scrolling sideways with no scrollbar
export const NoScrollbar: Story = { args: { scrollbar: "none" } }

// the ScrollBox component from the scan recap, with its copy button on hover
export const ScrollBoxComponent: Story = {
	args: { scrollbar: "scrollBox" },
	parameters: {
		// the app's scroll boxes sit on cards, popovers, and dialogs, on the card fill
		surface: "card",
	},
}
