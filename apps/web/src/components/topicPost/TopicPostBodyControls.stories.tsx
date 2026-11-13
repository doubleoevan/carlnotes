// the controls only a Topic Post's toolbar has: the Image button, an upload on its way, the alignment buttons, the code
// block's language, and the selected image's alt text
import type { NoteEditorInstance } from "@carlnotes/core/components/NoteViewer"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, userEvent } from "storybook/test"
import { TopicPostBodyControls } from "./TopicPostBodyControls"

// the alignment spies a story checks, and an editor whose every other method is a spy, in place of the ref the real
// editor fills
const setTextAlignment = fn().mockName("setTextAlignment")
const setImageAlign = fn().mockName("setImageAlign")
const storyEditor = new Proxy({ setTextAlignment, setImageAlign } as unknown as NoteEditorInstance, {
	get: (target, methodName) => Reflect.get(target, methodName) ?? fn().mockName(String(methodName)),
})

// a small square an upload's preview shows
const PREVIEW_URI =
	"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8'><rect width='8' height='8' fill='%23c47a3a'/></svg>"

const meta = {
	title: "TopicPost/TopicPostBodyControls",
	component: TopicPostBodyControls,
	args: {
		editorRef: { current: storyEditor },
		formatState: null,
		previewUris: [],
		isImageBlocked: false,
		onPickImages: fn(),
		codeBlockLanguage: null,
		isCodeBlockActive: false,
		imageAlt: null,
	},
	argTypes: { editorRef: { control: false }, onPickImages: { control: false } },
	// the controls sit in a toolbar row
	decorators: [
		(Story) => (
			<div className="flex items-center gap-1">
				<Story />
			</div>
		),
	],
	parameters: { layout: "padded" },
} satisfies Meta<typeof TopicPostBodyControls>

export default meta
type Story = StoryObj<typeof meta>

// the caret in plain text shows the Image button and the alignment buttons, none pressed
export const Default: Story = {}

// the caret in a centered paragraph presses Align center, and a press on it sets the paragraph back
export const CenteredParagraph: Story = {
	args: { formatState: { alignment: "center" } },
	play: async ({ canvas }) => {
		const centerButton = canvas.getByRole("button", { name: "Align center" })
		await expect(centerButton).toHaveAttribute("aria-pressed", "true")
		await userEvent.click(centerButton)
		await expect(setTextAlignment).toHaveBeenCalledWith("auto")
	},
}

// a selected image at the right presses Align right, and Align left moves it to the left with the text beside it
export const RightImage: Story = {
	args: {
		formatState: { image: { isActive: true, isBlocking: false, alt: "", align: "right" }, alignment: "center" },
		imageAlt: "",
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("button", { name: "Align right" })).toHaveAttribute("aria-pressed", "true")
		await userEvent.click(canvas.getByRole("button", { name: "Align left" }))
		await expect(setImageAlign).toHaveBeenCalledWith("left")
	},
}

// an upload on its way shows its preview under a spinner and says so to a screen reader
export const Uploading: Story = {
	args: { previewUris: [PREVIEW_URI] },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("status")).toHaveTextContent("Uploading image…")
	},
}

// the caret in a TypeScript code block shows the language menu with its language
export const InCodeBlock: Story = {
	args: { isCodeBlockActive: true, codeBlockLanguage: "typescript" },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("combobox", { name: "Code language" })).toHaveTextContent("TypeScript")
	},
}

// the caret in a code block with no language shows Auto, whose language is guessed for its colors
export const InAutoCodeBlock: Story = {
	args: { isCodeBlockActive: true, codeBlockLanguage: null },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("combobox", { name: "Code language" })).toHaveTextContent("Auto")
	},
}

// a selected image offers its alt text, which opens with the text the image has
export const ImageSelected: Story = {
	args: { imageAlt: "A latte with a fern in its foam" },
	play: async ({ canvas, canvasElement }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Alt text" }))
		const altInput = canvasElement.ownerDocument.querySelector<HTMLInputElement>(
			"input[placeholder='Describe the image']",
		)
		await expect(altInput?.value).toBe("A latte with a fern in its foam")
	},
}
