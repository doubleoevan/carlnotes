import { TOPIC_IMAGE_UPLOAD_TYPES } from "@carlnotes/contracts/topicImages"
import {
	type PickedTopicImage,
	TopicImageEditor as SharedTopicImageEditor,
	type TopicImageEditorButtonKind,
	type TopicImageEditorElements,
	type TopicImageEditorProps,
} from "@carlnotes/core/components/TopicImageEditor"
import { cn } from "@carlnotes/nightshift/classNames"
import { Camera, ImageUp, type LucideIcon, RefreshCw, X } from "lucide-react"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { TOPIC_IMAGE_FRAME_CLASS, TopicImage } from "@/components/primitives/topic-image"
import { IMAGE_SKELETON_CLASS } from "@/lib/styleClasses"

export type { TopicImageEditorTopic } from "@carlnotes/core/components/TopicImageEditor"

// each button's icon
const BUTTON_ICONS: Record<TopicImageEditorButtonKind, LucideIcon> = {
	regenerate: RefreshCw,
	upload: ImageUp,
	remove: X,
}

// the browser elements: the image at full width, as the topic info popover draws it, above the controls
const ELEMENTS: TopicImageEditorElements = {
	Layout: ({ image, children }) => (
		<div className="flex flex-col gap-3">
			{image}
			<div className="flex min-w-0 flex-col gap-2">{children}</div>
		</div>
	),
	PromptRow: ({ children }) => <div className="flex items-center gap-2">{children}</div>,
	Actions: ({ end, children }) => (
		<div className="flex flex-wrap items-center gap-2">
			{children}
			<div className="ml-auto">{end}</div>
		</div>
	),
	Line: ({ children }) => <p className="text-muted-foreground text-sm">{children}</p>,
	// the image is the upload button, with the camera overlay on hover or keyboard focus as the avatars show it
	Image: ({ uploadLabel, isRendering, isDisabled, onUpload, ...topicImageProps }) => (
		<button
			type="button"
			aria-label={uploadLabel}
			disabled={isDisabled}
			onClick={onUpload}
			className="group relative w-full cursor-pointer rounded-lg disabled:cursor-default"
		>
			<TopicImage
				{...topicImageProps}
				className={cn(TOPIC_IMAGE_FRAME_CLASS, "w-full", isRendering && IMAGE_SKELETON_CLASS)}
			/>
			<span className="absolute inset-0 grid place-items-center rounded-lg bg-black/55 opacity-0 transition-opacity group-enabled:group-hover:opacity-100 group-enabled:group-focus-visible:opacity-100">
				<Camera className="size-6 text-white" />
			</span>
		</button>
	),
	PromptInput: ({ label, value, placeholder, maxLength, isDisabled, onChange }) => (
		<Input
			aria-label={label}
			placeholder={placeholder}
			maxLength={maxLength}
			value={value}
			disabled={isDisabled}
			onChange={(event) => onChange(event.target.value)}
		/>
	),
	Button: ({ label, kind, isDisabled, onPress }) => {
		const ButtonIcon = BUTTON_ICONS[kind]
		return (
			<Button variant="outline" size="sm" disabled={isDisabled} onClick={onPress}>
				<ButtonIcon className="size-4" />
				{label}
			</Button>
		)
	},
}

// the browser's file picker: a file input opened by a click, resolved with the picked file or null when it closes
function pickImage(): Promise<PickedTopicImage | null> {
	return new Promise((resolve) => {
		const fileInput = document.createElement("input")
		fileInput.type = "file"
		fileInput.accept = TOPIC_IMAGE_UPLOAD_TYPES.join(",")
		fileInput.onchange = () => {
			const file = fileInput.files?.[0]
			if (!file) {
				resolve(null)
				return
			}
			const body = new FormData()
			body.append("image", file)
			resolve({ body, size: file.size, type: file.type })
		}
		fileInput.oncancel = () => resolve(null)
		fileInput.click()
	})
}

/**
 * The editor's image block in the browser.
 */
export function TopicImageEditor(props: TopicImageEditorProps) {
	return <SharedTopicImageEditor {...props} elements={ELEMENTS} pickImage={pickImage} />
}
