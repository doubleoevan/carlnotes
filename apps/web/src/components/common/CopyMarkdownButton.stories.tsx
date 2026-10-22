// the hover copy button on a notes scroll box, which copies the box's content as Markdown for an AI
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, screen, spyOn } from "storybook/test"
import { ScrollNote, toNotesMarkdown } from "@/components/topic/TopicScanRecap"
import { LLM_TOOLING_TOPIC_FIXTURE } from "../../../.storybook/fixtures"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { COPIED_FEEDBACK_MS, CopyMarkdownButton } from "./CopyMarkdownButton"

// the scan note the box renders
const SCAN_NOTE = [
	"## The scan of October 1",
	"",
	"- **A faster local runtime for small models**: a new release halves load time on a laptop.",
	"- **Prompt caching comes to two more providers**: repeated context now costs a tenth as much.",
].join("\n")

const meta = {
	title: "Common/CopyMarkdownButton",
	component: CopyMarkdownButton,
	// the Markdown the button copies: the linked topic title, then the note
	args: {
		markdown: toNotesMarkdown({
			topicId: LLM_TOOLING_TOPIC_FIXTURE.id,
			topicName: LLM_TOOLING_TOPIC_FIXTURE.name,
			note: SCAN_NOTE,
		}),
	},
	argTypes: { markdown: { control: "text" } },
	// the button sits on the corner of the scroll box that shows the rendered scan note, and copies the markdown arg
	render: ({ markdown }) => <ScrollNote note={SCAN_NOTE} copyMarkdown={markdown} />,
	// the scan recap popover and the topic card that show the box
	parameters: { surface: "card" },
	// the width and the text size of a scroll box in a popover
	decorators: [
		(Story) => (
			<div className="text-sm" style={{ maxWidth: 420 }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof CopyMarkdownButton>

export default meta
type Story = StoryObj<typeof meta>

// the box at rest, where the button shows only on hover or keyboard focus
export const Default: Story = {}

// the button shown by keyboard focus, with its tooltip
export const Focused: Story = {
	play: async ({ userEvent }) => {
		await userEvent.tab()
		await expect(await screen.findByRole("tooltip")).toHaveTextContent("Copy Markdown for AI")
	},
}

// the checkmark and the Copied tooltip just after a copy, with the clipboard stubbed and the revert timer held, so
// the copied state stays on screen
export const Copied: Story = {
	// the stubs reach the whole docs page, so the docs page gives this story its own frame to keep them from the rest
	parameters: { docs: toOwnFrameDocs(208) },
	beforeEach: () => {
		// stub the copy. a non-secure http origin has no clipboard api, so there the copy goes through the document's
		// copy command
		const copySpy = navigator.clipboard
			? spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)
			: spyOn(document, "execCommand").mockReturnValue(true)

		// every timer runs as before except the revert, which never fires
		const originalSetTimeout = globalThis.setTimeout
		const setTimeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(((
			handler: TimerHandler,
			delay?: number,
			...timerArgs: unknown[]
		) => (delay === COPIED_FEEDBACK_MS ? 0 : originalSetTimeout(handler, delay, ...timerArgs))) as typeof setTimeout)

		// put the copy and the timers back after the story
		return () => {
			copySpy.mockRestore()
			setTimeoutSpy.mockRestore()
		}
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Copy Markdown for AI" }))

		// the clipboard api copies the markdown arg on an origin that has it
		if (navigator.clipboard) {
			await expect(navigator.clipboard.writeText).toHaveBeenCalledWith(args.markdown)
		}

		// the button confirms the copy in its tooltip
		await expect(await screen.findByRole("tooltip")).toHaveTextContent("Copied")
	},
}
