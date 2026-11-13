// a Topic Post body image's upload, from the Image button or a paste: the images go up, and their stored urls go in
// together at the caret the upload began at. a pasted blob url never goes in
import { toApiUrl } from "@carlnotes/client/apiClient"
import { uploadTopicPostBodyImage } from "@carlnotes/client/topicPostClient"
import type { TopicPostBodyImageUploadResponse } from "@carlnotes/contracts/topicPostBodyImages"
import { type RefObject, useEffect, useRef, useState } from "react"
import type { NoteEditorCommands, NoteSelection } from "../lib/noteFormats"
import { type BodyImageSize, toBodyImageSrcPath, toWidthLimitedSize } from "../lib/topicPostBodyHtml"
import { toTopicPostBodyImageRejectionText } from "../lib/topicPosts"

// a picked or pasted image by the local uri each platform reads it from, and its type
export type PickedBodyImage = { uri: string; type: string }

// the uploads on their way, each by the local uri its preview shows
export type TopicPostBodyImageUploads = { previewUris: string[] }

type UseTopicPostBodyImageUploadOptions = {
	topicPostId: string
	editorRef: RefObject<NoteEditorCommands | null>
	selection: NoteSelection
	// how each platform puts a local image's bytes in the upload's form
	appendImage: (body: FormData, image: PickedBodyImage) => Promise<void>
	onError: (message: string) => void
	// the widest a platform's editor shows an inserted image, and where the stored image's path and size go
	imageWidthLimit?: number
	onImageStored?: (path: string, size: BodyImageSize) => void
}

// let go of a browser's blob url and the image bytes it holds. a phone's file uri holds nothing
function revokeBlobUrl(uri: string): void {
	if (uri.startsWith("blob:")) {
		URL.revokeObjectURL(uri)
	}
}

/**
 * Uploads picked and pasted images for a Topic Post's body, and inserts the stored images together at the caret their
 * upload began at. A failed upload inserts nothing and reports why, and closing the editor or opening another Topic
 * Post aborts the uploads on their way.
 */
export function useTopicPostBodyImageUpload({
	topicPostId,
	editorRef,
	selection,
	appendImage,
	onError,
	imageWidthLimit,
	onImageStored,
}: UseTopicPostBodyImageUploadOptions): TopicPostBodyImageUploads & {
	uploadImages: (images: PickedBodyImage[]) => void
} {
	// the previews of the uploads on their way
	const [previewUris, setPreviewUris] = useState<string[]>([])

	// an editor that closes aborts its uploads on their way, and starts no more. another Topic Post opens a new editor
	const abortControllerRef = useRef(new AbortController())
	useEffect(() => {
		const abortController = new AbortController()
		abortControllerRef.current = abortController
		return () => abortController.abort()
	}, [])

	// upload one image while its preview shows, and return the stored image, or null if it was rejected or abandoned
	async function uploadImage(
		image: PickedBodyImage,
		signal: AbortSignal,
	): Promise<TopicPostBodyImageUploadResponse | null> {
		setPreviewUris((uris) => [...uris, image.uri])
		try {
			const body = new FormData()
			await appendImage(body, image)
			return await uploadTopicPostBodyImage(topicPostId, body, signal)
		} catch (error) {
			// a rejection says why, and an abandoned upload says nothing
			if (!signal.aborted) {
				onError(toTopicPostBodyImageRejectionText(error instanceof Error ? error.message : ""))
			}
			return null
		} finally {
			// the preview goes, and a browser's blob url lets go of the image's bytes
			setPreviewUris((uris) => uris.filter((uri) => uri !== image.uri))
			revokeBlobUrl(image.uri)
		}
	}

	// each image goes up in turn, and the stored ones go in together at the caret the upload began at, in their order
	async function uploadImages(images: PickedBodyImage[]): Promise<void> {
		const caret = selection.start
		const { signal } = abortControllerRef.current
		const uploadedImages: TopicPostBodyImageUploadResponse[] = []
		for (const image of images) {
			// a closed editor starts none of the images left, and lets go of their blob urls
			if (signal.aborted) {
				revokeBlobUrl(image.uri)
				continue
			}

			// a stored image waits for the rest of the batch
			const uploadedImage = await uploadImage(image, signal)
			if (uploadedImage) {
				uploadedImages.push(uploadedImage)
			}
		}

		// a closed editor inserts none of them
		if (!signal.aborted && uploadedImages.length > 0) {
			insertUploadedImages(uploadedImages, caret)
		}
	}

	// the caret may have moved while the images went up, and each stored image goes in no wider than the editor shows
	// it, after the one before
	function insertUploadedImages(uploadedImages: TopicPostBodyImageUploadResponse[], caret: number): void {
		const editor = editorRef.current
		editor?.setSelection?.(caret, caret)
		for (const uploadedImage of uploadedImages) {
			// the save puts back the stored size at the image's path
			const storedSize = { width: uploadedImage.width, height: uploadedImage.height }
			onImageStored?.(toBodyImageSrcPath(uploadedImage.url), storedSize)
			const { width, height } = imageWidthLimit ? toWidthLimitedSize(storedSize, imageWidthLimit) : storedSize
			editor?.setImage?.(toApiUrl(uploadedImage.url), width, height)
		}
	}

	// the previews, and the start of the uploads
	return { previewUris, uploadImages: (images) => void uploadImages(images) }
}
