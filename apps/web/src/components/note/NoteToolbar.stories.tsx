// the note's formatting toolbar: every control, lit from the editor's state and disabled while blocked
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import type { EnrichedTextInputInstance, OnChangeStateEvent } from "react-native-enriched-html"
import { fn } from "storybook/test"
import { NoteToolbar } from "./NoteToolbar"

// one style's state while it is inactive and free to toggle
const INACTIVE_STYLE = { isActive: false, isConflicting: false, isBlocking: false }

// the editor's state in plain text, with no style active
const PLAIN_TEXT_STATE: OnChangeStateEvent = {
	bold: INACTIVE_STYLE,
	italic: INACTIVE_STYLE,
	underline: INACTIVE_STYLE,
	strikeThrough: INACTIVE_STYLE,
	inlineCode: INACTIVE_STYLE,
	h1: INACTIVE_STYLE,
	h2: INACTIVE_STYLE,
	h3: INACTIVE_STYLE,
	h4: INACTIVE_STYLE,
	h5: INACTIVE_STYLE,
	h6: INACTIVE_STYLE,
	codeBlock: INACTIVE_STYLE,
	blockQuote: INACTIVE_STYLE,
	orderedList: INACTIVE_STYLE,
	unorderedList: INACTIVE_STYLE,
	link: INACTIVE_STYLE,
	image: INACTIVE_STYLE,
	mention: INACTIVE_STYLE,
	checkboxList: INACTIVE_STYLE,
	alignment: "auto",
}

// an editor whose every method is a spy, in place of the ref the real editor fills
const storyEditor = new Proxy({} as EnrichedTextInputInstance, {
	get: (_target, methodName) => fn().mockName(String(methodName)),
})

const meta = {
	title: "Note/NoteToolbar",
	component: NoteToolbar,
	args: {
		editorRef: { current: storyEditor },
		formatState: PLAIN_TEXT_STATE,
		selection: { start: 0, end: 0, text: "" },
		activeLink: null,
	},
	argTypes: {
		editorRef: { control: false },
		formatState: { control: false },
		selection: { control: false },
		activeLink: { control: false },
	},
	parameters: { layout: "padded" },
} satisfies Meta<typeof NoteToolbar>

export default meta
type Story = StoryObj<typeof meta>

// the caret in plain text
export const Default: Story = {}

// the caret in bold text inside a heading, both lit
export const BoldHeading: Story = {
	args: {
		formatState: {
			...PLAIN_TEXT_STATE,
			bold: { ...INACTIVE_STYLE, isActive: true },
			h2: { ...INACTIVE_STYLE, isActive: true },
		},
	},
}

// the caret in a code block, which blocks every inline mark and the link
export const InCodeBlock: Story = {
	args: {
		formatState: {
			...PLAIN_TEXT_STATE,
			codeBlock: { ...INACTIVE_STYLE, isActive: true },
			bold: { ...INACTIVE_STYLE, isBlocking: true },
			italic: { ...INACTIVE_STYLE, isBlocking: true },
			underline: { ...INACTIVE_STYLE, isBlocking: true },
			strikeThrough: { ...INACTIVE_STYLE, isBlocking: true },
			inlineCode: { ...INACTIVE_STYLE, isBlocking: true },
			link: { ...INACTIVE_STYLE, isBlocking: true },
		},
	},
}

// the caret in a link, whose control opens on the link's url
export const InLink: Story = {
	args: {
		formatState: { ...PLAIN_TEXT_STATE, link: { ...INACTIVE_STYLE, isActive: true } },
		selection: { start: 6, end: 6, text: "" },
		activeLink: { text: "a link", url: "https://carlnotes.com", start: 6, end: 12 },
	},
}
