// the container that attaches files dropped on it, with an overlay while a file drag is over it
import { toAvatarInitials } from "@carlnotes/contracts/avatars"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fireEvent, fn } from "storybook/test"
import { AvatarDropOverlay } from "@/components/avatar/AvatarUpload"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { COMPOSER_FRAME_CLASS } from "@/lib/styleClasses"
import { STORY_USER } from "../../../.storybook/fixtures"
import { FileDropZone } from "./FileDropZone"

// the text inside the composer box, which the drag events start on
const COMPOSER_TEXT = "Ask Carl about LLM tooling, or drop a file here"

// the file a story drags in
const DROPPED_FILE = new File(["# LLM tooling notes"], "llm-tooling-notes.md", { type: "text/markdown" })

// a file drag event whose data transfer holds the dropped file, so its types include Files like a real file drag.
// fireEvent swaps a real data transfer for an empty one, so the story builds the event itself
function toFileDragEvent(eventType: "dragenter" | "drop"): DragEvent {
	const dataTransfer = new DataTransfer()
	dataTransfer.items.add(DROPPED_FILE)
	return new DragEvent(eventType, { bubbles: true, cancelable: true, dataTransfer })
}

const meta = {
	title: "Common/FileDropZone",
	component: FileDropZone,
	args: {
		onDropFiles: fn(),
		className: COMPOSER_FRAME_CLASS,
		children: (
			<p className="text-foreground text-sm" style={{ minHeight: 72 }}>
				{COMPOSER_TEXT}
			</p>
		),
	},
	argTypes: {
		onDropFiles: { control: false },
		overlay: { control: false },
		children: { control: false },
		className: { control: "text" },
	},
	// the chat panel and the dialogs that hold the composer box and the avatar pickers
	parameters: { surface: "card" },
	decorators: [
		(Story) => (
			<div style={{ maxWidth: 420 }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof FileDropZone>

export default meta
type Story = StoryObj<typeof meta>

// the chat composer box at rest
export const Default: Story = {}

// a file dragged over the composer box, which shows the paperclip overlay
export const DraggingFiles: Story = {
	play: async ({ canvas }) => {
		fireEvent(canvas.getByText(COMPOSER_TEXT), toFileDragEvent("dragenter"))
		await expect(await canvas.findByText("Drop to attach")).toBeVisible()
	},
}

// a file dropped on the composer box, which calls onDropFiles with it and clears the overlay
export const DroppedFile: Story = {
	play: async ({ args, canvas }) => {
		const composerText = canvas.getByText(COMPOSER_TEXT)
		fireEvent(composerText, toFileDragEvent("dragenter"))
		fireEvent(composerText, toFileDragEvent("drop"))
		await expect(args.onDropFiles).toHaveBeenCalledWith([DROPPED_FILE])
		await expect(canvas.queryByText("Drop to attach")).toBeNull()
	},
}

// the user's avatar picker mid-drag: the 56px avatar with its own camera overlay in place of the paperclip
export const AvatarOverlay: Story = {
	args: {
		className: "w-fit",
		overlay: <AvatarDropOverlay />,
		children: (
			<span className="block size-14">
				<UserAvatar
					userId={STORY_USER.userId}
					username={STORY_USER.username}
					avatarVersion={null}
					className="size-full"
				/>
			</span>
		),
	},
	parameters: { session: "user" },
	play: async ({ canvas }) => {
		fireEvent(canvas.getByText(toAvatarInitials(STORY_USER.username)), toFileDragEvent("dragenter"))
	},
}
