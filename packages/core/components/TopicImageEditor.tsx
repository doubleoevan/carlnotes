// the editor's image block, shared by both apps: a topic's or a podcast episode's image, which a click or tap uploads
// over, Regenerate from an image prompt while the month has regenerations left, and the month's regeneration count.
// The platform supplies the layout, the input, the button, and the file picker

import { showClientError } from "@carlnotes/client/apiClient"
import {
	sendPodcastEpisodeImageRegeneration,
	uploadPodcastEpisodeImageBody,
} from "@carlnotes/client/podcastEpisodeClient"
import { sendTopicImageRegeneration, uploadTopicImageBody } from "@carlnotes/client/topicImageClient"
import { TOPIC_IMAGE_PROMPT_CHARS } from "@carlnotes/contracts/topicImages"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { type ComponentType, type ReactNode, useState } from "react"
import { useTopicImageRender } from "../hooks/useTopicImageRender"
import {
	type EditableImageKind,
	hasRegenerationLeft,
	REGENERATE_LABEL,
	TOPIC_IMAGE_PROMPT_LABEL,
	TOPIC_IMAGE_RENDERING_TEXT,
	TOPIC_IMAGE_SAVE_FAILED_TEXT,
	toRegenerationCountLabel,
	toUploadRejection,
	UPLOAD_IMAGE_LABEL,
} from "../lib/topicImageEditor"
import type { TopicImageProps } from "./TopicImage"

// what the block edits: a topic or a podcast episode by its id, the name its image falls back to, the image, its
// origin, the image prompt it was drawn from, and the editor's regenerations this month
export type EditableImage = Pick<
	TopicResponse,
	"id" | "name" | "image" | "imageOrigin" | "imagePrompt" | "imageRegenerationQuota"
> & { kind: EditableImageKind }

// the api calls that change each kind's image: a fresh render and an upload
const IMAGE_WRITES = {
	topic: { sendRegeneration: sendTopicImageRegeneration, uploadBody: uploadTopicImageBody },
	podcastEpisode: { sendRegeneration: sendPodcastEpisodeImageRegeneration, uploadBody: uploadPodcastEpisodeImageBody },
} satisfies Record<EditableImageKind, unknown>

// a picked image file as the platform's picker returns it: the multipart body with the file as its image field, and
// the file's size and type for the check before the upload
export type PickedTopicImage = { body: FormData; size: number; type: string }

// the platform's elements: the layout with the image above its controls, the image prompt row, a line of text, the
// image with its upload control, pulsing without its picture while a render runs, the image prompt input, and the
// Regenerate button
export type TopicImageEditorElements = {
	Layout: ComponentType<{ image: ReactNode; children: ReactNode }>
	PromptRow: ComponentType<{ children: ReactNode }>
	Line: ComponentType<{ children: string }>
	Image: ComponentType<
		TopicImageProps & { uploadLabel: string; isRendering: boolean; isDisabled: boolean; onUpload: () => void }
	>
	PromptInput: ComponentType<{
		label: string
		value: string
		placeholder: string
		maxLength: number
		isDisabled: boolean
		onChange: (value: string) => void
	}>
	RegenerateButton: ComponentType<{ label: string; isDisabled: boolean; onPress: () => void }>
}

export type TopicImageEditorProps = {
	editableImage: EditableImage
	// called once each new image is in place: after an upload, and once a render succeeds
	onImageChanged?: () => void
}

/**
 * Edits a topic's or a podcast episode's image. A render polls until it succeeds, and an upload replaces the image at
 * once. Each new image in place calls onImageChanged.
 */
export function TopicImageEditor({
	editableImage,
	onImageChanged,
	elements: { Layout, PromptRow, Line, Image, PromptInput, RegenerateButton },
	pickImage,
}: TopicImageEditorProps & {
	elements: TopicImageEditorElements
	// the platform's file picker, which returns null when the user picks nothing
	pickImage: () => Promise<PickedTopicImage | null>
}) {
	const { image, isRendering, watchRender, replaceImage } = useTopicImageRender(editableImage.image, onImageChanged)
	const [imagePrompt, setImagePrompt] = useState(editableImage.imagePrompt ?? "")
	const [regenerationsUsed, setRegenerationsUsed] = useState(editableImage.imageRegenerationQuota?.used ?? 0)
	const [isWriting, setIsWriting] = useState(false)
	const regenerationQuota = editableImage.imageRegenerationQuota && {
		...editableImage.imageRegenerationQuota,
		used: regenerationsUsed,
	}
	const isBusy = isWriting || isRendering
	const imageWrites = IMAGE_WRITES[editableImage.kind]

	// run one write, reporting its rejection
	const runImageWrite = async (write: () => Promise<void>): Promise<void> => {
		setIsWriting(true)
		try {
			await write()
		} catch (error) {
			showClientError(error instanceof Error ? error.message : TOPIC_IMAGE_SAVE_FAILED_TEXT)
		} finally {
			setIsWriting(false)
		}
	}

	// a fresh render, from the image prompt if there is one, which counts one regeneration
	const handleRegenerate = (): void =>
		void runImageWrite(async () => {
			watchRender(await imageWrites.sendRegeneration(editableImage.id, imagePrompt.trim() || undefined))
			setRegenerationsUsed((used) => used + 1)
		})

	// the picked file replaces the image at once after the upload check
	const handleUpload = (): void =>
		void runImageWrite(async () => {
			const pickedImage = await pickImage()
			if (!pickedImage) {
				return
			}
			const uploadRejection = toUploadRejection(pickedImage)
			if (uploadRejection) {
				throw new Error(uploadRejection)
			}
			replaceImage(await imageWrites.uploadBody(editableImage.id, pickedImage.body))
			setImagePrompt("")
			onImageChanged?.()
		})

	return (
		<Layout
			image={
				<Image
					image={isRendering ? null : image}
					isRendering={isRendering}
					size="page"
					name={editableImage.name}
					uploadLabel={UPLOAD_IMAGE_LABEL}
					isDisabled={isBusy}
					onUpload={handleUpload}
				/>
			}
		>
			{/* Regenerate with its image prompt, while the month has regenerations left. an admin, who has no count, always may */}
			{(!regenerationQuota || hasRegenerationLeft(regenerationQuota)) && (
				<PromptRow>
					<PromptInput
						label={TOPIC_IMAGE_PROMPT_LABEL}
						value={imagePrompt}
						placeholder={TOPIC_IMAGE_PROMPT_LABEL}
						maxLength={TOPIC_IMAGE_PROMPT_CHARS}
						isDisabled={isBusy}
						onChange={setImagePrompt}
					/>
					<RegenerateButton label={REGENERATE_LABEL} isDisabled={isBusy} onPress={handleRegenerate} />
				</PromptRow>
			)}
			{/* the render under way */}
			{isRendering && <Line>{TOPIC_IMAGE_RENDERING_TEXT}</Line>}
			{/* the month's regeneration count. an admin has none */}
			{regenerationQuota && <Line>{toRegenerationCountLabel(regenerationQuota)}</Line>}
		</Layout>
	)
}
