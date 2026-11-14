// the editor's image block, shared by both apps: a topic's, a podcast episode's, a Topic Post's, or a film's image,
// which a click or tap uploads over, the line under an upload that is shown to its uploader alone, Regenerate from an
// image prompt while the month has regenerations left, and the month's regeneration count. a film's image has the
// film's 16:9 frame, and every other image is 3:2. the platform supplies the layout, the input, the button, and the
// file picker

import { showClientError } from "@carlnotes/client/apiClient"
import {
	sendPodcastEpisodeImageRegeneration,
	sendTopicPodcastEpisodeVideoImageRegeneration,
	uploadPodcastEpisodeImageBody,
	uploadTopicPodcastEpisodeVideoImageBody,
} from "@carlnotes/client/podcastEpisodeClient"
import {
	sendTopicImageRegeneration,
	type UploadedTopicImage,
	uploadTopicImageBody,
} from "@carlnotes/client/topicImageClient"
import { sendTopicPostImageRegeneration, uploadTopicPostImageBody } from "@carlnotes/client/topicPostClient"
import {
	TOPIC_IMAGE_PROMPT_CHARS,
	toTopicPodcastEpisodeVideoImageUrls,
	toUncheckedTopicImageUrls,
} from "@carlnotes/contracts/topicImages"
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
import { UNCHECKED_IMAGE_TEXT } from "../lib/uncheckedImageCopy"
import type { TopicImageProps } from "./TopicImage"

// what the block edits: a topic, a podcast episode, or a Topic Post by its id, or a film by its podcast episode's id,
// the name its image falls back to, the image, its origin, the image prompt it was drawn from, whether the image is
// the editor's own upload shown to them alone, and the editor's regenerations this month
export type EditableImage = Pick<
	TopicResponse,
	"id" | "name" | "image" | "imageOrigin" | "imagePrompt" | "imageRegenerationQuota" | "isImageUnchecked"
> & { kind: EditableImageKind }

// the api calls that change each kind's image: a fresh render, and an upload that returns the image the block shows
// and whether the upload is unchecked. a film's upload returns its poster, which the block shows as the image
const IMAGE_WRITES = {
	topic: { sendRegeneration: sendTopicImageRegeneration, uploadBody: uploadTopicImageBody },
	podcastEpisode: { sendRegeneration: sendPodcastEpisodeImageRegeneration, uploadBody: uploadPodcastEpisodeImageBody },
	topicPost: { sendRegeneration: sendTopicPostImageRegeneration, uploadBody: uploadTopicPostImageBody },
	topicPodcastEpisodeVideo: {
		sendRegeneration: sendTopicPodcastEpisodeVideoImageRegeneration,
		uploadBody: async (podcastEpisodeId: string, body: FormData): Promise<UploadedTopicImage> => {
			const { posterUrl, isImageUnchecked } = await uploadTopicPodcastEpisodeVideoImageBody(podcastEpisodeId, body)
			return { image: toTopicPodcastEpisodeVideoImageUrls(posterUrl), isImageUnchecked }
		},
	},
} satisfies Record<EditableImageKind, unknown>

// a picked image file as the platform's picker returns it: the multipart body with the file as its image field, and
// the file's size and type for the check before the upload
export type PickedTopicImage = { body: FormData; size: number; type: string }

// the shape of the image's frame: 3:2, or a film's 16:9
type EditableImageAspectRatio = "3:2" | "16:9"

// the platform's elements: the layout with the image above its controls, the image prompt row, a line of text, the
// image at its frame's shape with its upload control, pulsing without its picture while a render runs, the image
// prompt input, and the Regenerate button
export type TopicImageEditorElements = {
	Layout: ComponentType<{ image: ReactNode; children: ReactNode }>
	PromptRow: ComponentType<{ children: ReactNode }>
	Line: ComponentType<{ children: string }>
	Image: ComponentType<
		TopicImageProps & {
			aspectRatio: EditableImageAspectRatio
			uploadLabel: string
			isRendering: boolean
			isDisabled: boolean
			onUpload: () => void
		}
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
 * Edits a topic's, a podcast episode's, a Topic Post's, or a film's image. A render polls until it succeeds, and an
 * upload replaces the image at once, with a line under it while the upload is shown to the editor alone. Each new
 * image in place calls onImageChanged.
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
	const [isImageUnchecked, setIsImageUnchecked] = useState(editableImage.isImageUnchecked ?? false)
	const [isWriting, setIsWriting] = useState(false)
	const regenerationQuota = editableImage.imageRegenerationQuota && {
		...editableImage.imageRegenerationQuota,
		used: regenerationsUsed,
	}
	const isBusy = isWriting || isRendering
	const imageWrites = IMAGE_WRITES[editableImage.kind]

	// a film's image has the film's frame. Regenerate shows while the month has regenerations left, and an admin, who
	// has no count, always may
	const aspectRatio: EditableImageAspectRatio = editableImage.kind === "topicPodcastEpisodeVideo" ? "16:9" : "3:2"
	const canRegenerate = !regenerationQuota || hasRegenerationLeft(regenerationQuota)

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

	// a fresh render, from the image prompt if there is one, which counts one regeneration and drops an unchecked
	// upload
	const handleRegenerate = (): void =>
		void runImageWrite(async () => {
			watchRender(await imageWrites.sendRegeneration(editableImage.id, imagePrompt.trim() || undefined))
			setRegenerationsUsed((used) => used + 1)
			setIsImageUnchecked(false)
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

			// the upload shows at once. an unchecked one shows at its urls marked as an unchecked image's, with its
			// line
			const { image: uploadedImage, isImageUnchecked: isUploadUnchecked = false } = await imageWrites.uploadBody(
				editableImage.id,
				pickedImage.body,
			)
			replaceImage(isUploadUnchecked ? toUncheckedTopicImageUrls(uploadedImage) : uploadedImage)
			setIsImageUnchecked(isUploadUnchecked)
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
					aspectRatio={aspectRatio}
					name={editableImage.name}
					uploadLabel={UPLOAD_IMAGE_LABEL}
					isDisabled={isBusy}
					onUpload={handleUpload}
				/>
			}
		>
			{/* the upload only the editor sees until its check passes */}
			{isImageUnchecked && <Line>{UNCHECKED_IMAGE_TEXT}</Line>}
			{/* Regenerate beside the image prompt */}
			{canRegenerate && (
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
