// the editor's image block, shared by both apps: the topic's image, which a click or tap uploads over, Regenerate
// from an image prompt while the month has regenerations left, Upload with the month's regeneration count beside it, and
// Remove for an upload. The platform supplies the layout, the input, the buttons, and the file picker

import { showClientError } from "@carlnotes/client/apiClient"
import {
	sendTopicImageRegeneration,
	sendTopicImageRemoval,
	uploadTopicImageBody,
} from "@carlnotes/client/topicImageClient"
import { TOPIC_IMAGE_PROMPT_CHARS } from "@carlnotes/contracts/topicImages"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { type ComponentType, type ReactNode, useState } from "react"
import { useTopicImageRender } from "../hooks/useTopicImageRender"
import {
	hasRegenerationLeft,
	REGENERATE_LABEL,
	REMOVE_UPLOAD_LABEL,
	TOPIC_IMAGE_PROMPT_LABEL,
	TOPIC_IMAGE_RENDERING_TEXT,
	TOPIC_IMAGE_SAVE_FAILED_TEXT,
	toRegenerationCountLabel,
	toUploadRejection,
	UPLOAD_IMAGE_LABEL,
	UPLOAD_LABEL,
} from "../lib/topicImageEditor"
import type { TopicImageProps } from "./TopicImage"

// what the block edits: the topic's image, its origin, the image prompt it was drawn from, and the editor's
// regenerations this month
export type TopicImageEditorTopic = Pick<
	TopicResponse,
	"id" | "name" | "image" | "imageOrigin" | "imagePrompt" | "imageRegenerationQuota"
>

// a picked image file as the platform's picker returns it: the multipart body with the file as its image field, and
// the file's size and type for the check before the upload
export type PickedTopicImage = { body: FormData; size: number; type: string }

// the block's buttons: what each one does, which the platform draws with its icon
export type TopicImageEditorButtonKind = "regenerate" | "upload" | "remove"

// the platform's elements: the layout with the image above its controls, the image prompt row, the action row with a
// line at its end, a line of text, the image with its upload control, pulsing without its picture while a render runs,
// the image prompt input, and a button
export type TopicImageEditorElements = {
	Layout: ComponentType<{ image: ReactNode; children: ReactNode }>
	PromptRow: ComponentType<{ children: ReactNode }>
	Actions: ComponentType<{ end: ReactNode; children: ReactNode }>
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
	Button: ComponentType<{ label: string; kind: TopicImageEditorButtonKind; isDisabled: boolean; onPress: () => void }>
}

export type TopicImageEditorProps = {
	topic: TopicImageEditorTopic
	// called after each saved change
	onImageChanged?: () => void
}

/**
 * Edits a topic's image. A render polls until it lands, an upload replaces the image at once, and Remove on an upload
 * starts a fresh render. Each change calls onImageChanged.
 */
export function TopicImageEditor({
	topic,
	onImageChanged,
	elements: { Layout, PromptRow, Actions, Line, Image, PromptInput, Button },
	pickImage,
}: TopicImageEditorProps & {
	elements: TopicImageEditorElements
	// the platform's file picker, which returns null when the user picks nothing
	pickImage: () => Promise<PickedTopicImage | null>
}) {
	const { image, isRendering, watchRender, replaceImage } = useTopicImageRender(topic.image)
	const [imagePrompt, setImagePrompt] = useState(topic.imagePrompt ?? "")
	const [regenerationsUsed, setRegenerationsUsed] = useState(topic.imageRegenerationQuota?.used ?? 0)
	const [imageOrigin, setImageOrigin] = useState(topic.imageOrigin)
	const [isWriting, setIsWriting] = useState(false)
	const regenerationQuota = topic.imageRegenerationQuota && { ...topic.imageRegenerationQuota, used: regenerationsUsed }
	const isBusy = isWriting || isRendering

	// run one write, reporting its rejection
	const runImageWrite = async (write: () => Promise<void>): Promise<void> => {
		setIsWriting(true)
		try {
			await write()
			onImageChanged?.()
		} catch (error) {
			showClientError(error instanceof Error ? error.message : TOPIC_IMAGE_SAVE_FAILED_TEXT)
		} finally {
			setIsWriting(false)
		}
	}

	// a fresh render, from the image prompt if there is one, which counts one regeneration
	const handleRegenerate = (): void =>
		void runImageWrite(async () => {
			watchRender(await sendTopicImageRegeneration(topic.id, imagePrompt.trim() || undefined))
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
			replaceImage(await uploadTopicImageBody(topic.id, pickedImage.body))
			setImageOrigin("uploaded")
			setImagePrompt("")
		})

	// the upload goes, and a fresh render takes its place
	const handleRemove = (): void =>
		void runImageWrite(async () => {
			watchRender(await sendTopicImageRemoval(topic.id))
			setRegenerationsUsed((used) => used + 1)
			setImageOrigin("generated")
		})

	return (
		<Layout
			image={
				<Image
					image={isRendering ? null : image}
					isRendering={isRendering}
					size="page"
					name={topic.name}
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
					<Button label={REGENERATE_LABEL} kind="regenerate" isDisabled={isBusy} onPress={handleRegenerate} />
				</PromptRow>
			)}
			{/* the render under way */}
			{isRendering && <Line>{TOPIC_IMAGE_RENDERING_TEXT}</Line>}
			{/* the upload and the removal of one, with the month's regeneration count at the row's end */}
			<Actions end={regenerationQuota && <Line>{toRegenerationCountLabel(regenerationQuota)}</Line>}>
				<Button label={UPLOAD_LABEL} kind="upload" isDisabled={isBusy} onPress={handleUpload} />
				{imageOrigin === "uploaded" && (
					<Button label={REMOVE_UPLOAD_LABEL} kind="remove" isDisabled={isBusy} onPress={handleRemove} />
				)}
			</Actions>
		</Layout>
	)
}
