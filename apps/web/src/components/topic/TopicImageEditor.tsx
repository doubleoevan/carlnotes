import {
	type PickedTopicImage,
	TopicImageEditor as SharedTopicImageEditor,
	type TopicImageEditorButtonKind,
	type TopicImageEditorElements,
	type TopicImageEditorProps,
} from "@carlnotes/core/components/TopicImageEditor"
import {
	MAX_ATTACHMENT_IMAGE_PIXELS,
	PICKED_IMAGE_ACCEPT,
	UNREADABLE_IMAGE_TEXT,
} from "@carlnotes/core/lib/imageUpload"
import { cn } from "@carlnotes/nightshift/classNames"
import { type LucideIcon, RefreshCw, X } from "lucide-react"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { resizeImageFile } from "@/lib/imageResize"
import { IMAGE_SKELETON_CLASS } from "@/lib/styleClasses"
import { TopicImageButton } from "./TopicImageButton"

export type { TopicImageEditorSubject } from "@carlnotes/core/components/TopicImageEditor"

// each button's icon
const BUTTON_ICONS: Record<TopicImageEditorButtonKind, LucideIcon> = {
	regenerate: RefreshCw,
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
	// the image is the upload button, pulsing while a render runs
	Image: ({ uploadLabel, isRendering, isDisabled, onUpload, className, ...topicImageProps }) => (
		<TopicImageButton
			{...topicImageProps}
			label={uploadLabel}
			isDisabled={isDisabled}
			onClick={onUpload}
			className="w-full"
			imageClassName={cn(className, isRendering && IMAGE_SKELETON_CLASS)}
		/>
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

// the browser's file picker: a file input opened by a click, resolved with the picked file shrunk and re-encoded to a
// jpeg or png the api takes, or null when it closes. a file the browser can't decode throws an error
function pickImage(): Promise<PickedTopicImage | null> {
	return new Promise((resolve, reject) => {
		const fileInput = document.createElement("input")
		fileInput.type = "file"
		fileInput.accept = PICKED_IMAGE_ACCEPT
		fileInput.onchange = () => {
			const file = fileInput.files?.[0]
			if (!file) {
				resolve(null)
				return
			}
			// a file that decodes but fails to re-encode, or doesn't decode at all, can't be read
			void resizeImageFile(file, MAX_ATTACHMENT_IMAGE_PIXELS)
				.catch(() => null)
				.then((resizedFile) => {
					if (!resizedFile) {
						reject(new Error(UNREADABLE_IMAGE_TEXT))
						return
					}
					const body = new FormData()
					body.append("image", resizedFile)
					resolve({ body, size: resizedFile.size, type: resizedFile.type })
				})
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
