// the scroll box: a bordered box whose overflow scrolls on the highlight scrollbar, with an optional copy button
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { ScrollBox } from "./ScrollBox"

// the scan note's paragraphs the box overflows with
const SCAN_NOTE_PARAGRAPHS = [
	"Carl read 42 pages on LLM tooling this morning and kept six.",
	"Two findings cover evaluation harnesses, and one walks through caching prompts across a long chat.",
	"The rest are release notes from the tools the topic already follows, with the changes that matter called out.",
	"A Reddit thread asks which tracing tool holds up past a thousand requests a minute, and the answers disagree.",
	"Tomorrow's scan starts at 9:00 AM and reads the same Sources.",
]

const meta = {
	title: "Common/ScrollBox",
	component: ScrollBox,
	args: {
		children: SCAN_NOTE_PARAGRAPHS.map((noteParagraph) => (
			<p key={noteParagraph} className="mb-3 last:mb-0">
				{noteParagraph}
			</p>
		)),
	},
	argTypes: {
		copyMarkdown: { control: "text" },
		className: { control: "text" },
		boxClassName: { control: "text" },
		children: { control: false },
		scrollToTopOn: { control: false },
	},
	// the app's scroll boxes sit on cards, popovers, and dialogs, on the card fill
	parameters: { surface: "card" },
	// a narrow column in the small text of a popover
	decorators: [
		(Story) => (
			<div className="text-sm" style={{ maxWidth: 320 }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof ScrollBox>

export default meta
type Story = StoryObj<typeof meta>

// the box with no copy button, its height bounded through className so the note scrolls
export const Default: Story = { args: { className: "max-h-32" } }

// the copy button on the box's corner, which shows on hover or keyboard focus
export const WithCopyButton: Story = {
	args: { className: "max-h-32", copyMarkdown: SCAN_NOTE_PARAGRAPHS.join("\n\n") },
}
