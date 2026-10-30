// a file picked from Files, the photo library, or the camera, in the one shape every file action reads

import { toSuffixMimeType } from "@carlnotes/contracts/attachmentTypes"

// a picked file's local copy, name, type, and size
export type PickedFile = {
	uri: string
	name: string
	mimeType: string
	byteSize: number
}

// the fields of a document picker asset that a picked file reads
type DocumentAsset = { uri: string; name: string; mimeType?: string | null; size?: number | null }

// the fields of an image picker asset that a picked file reads
type ImageAsset = {
	uri: string
	fileName?: string | null
	mimeType?: string | null
	fileSize?: number | null
	type?: string | null
}

/**
 * Returns a document picker asset as a picked file, typed by its suffix if the picker gives no type.
 */
export function toPickedDocument(asset: DocumentAsset): PickedFile {
	// a provider that reports no type, or a generic one, leaves the type to the name's suffix
	const isTypeKnown = Boolean(asset.mimeType) && asset.mimeType !== "application/octet-stream"
	return {
		uri: asset.uri,
		name: asset.name,
		mimeType: (isTypeKnown ? asset.mimeType : toSuffixMimeType(asset.name)) ?? asset.mimeType ?? "",
		byteSize: asset.size ?? 0,
	}
}

/**
 * Returns a photo library or camera asset as a picked file, named for its kind when the picker gives no name.
 */
export function toPickedImage(asset: ImageAsset): PickedFile {
	// a camera shot and some library assets arrive unnamed, so the name comes from the kind and the type
	const isVideo = asset.type === "video"
	const mimeType = asset.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg")
	const fallbackName = `${isVideo ? "video" : "photo"}.${mimeType.split("/")[1] ?? "jpg"}`
	return {
		uri: asset.uri,
		name: asset.fileName || fallbackName,
		mimeType,
		byteSize: asset.fileSize ?? 0,
	}
}

/**
 * Returns whether a picker accept list takes images, and whether it takes video.
 */
export function toAcceptedMedia(accept: string[]): { isImageAccepted: boolean; isVideoAccepted: boolean } {
	return {
		isImageAccepted: accept.some((acceptEntry) => acceptEntry.startsWith("image/")),
		isVideoAccepted: accept.some((acceptEntry) => acceptEntry.startsWith("video/")),
	}
}

/**
 * Returns whether a picked file is an image the resizer re-encodes.
 */
export function isPickedImage(pickedFile: PickedFile): boolean {
	return pickedFile.mimeType.startsWith("image/")
}

/**
 * Returns a picked file's name with its suffix replaced, for an image re-encoded to another format.
 */
export function toRenamedFileName(name: string, suffix: string): string {
	return `${name.replace(/\.[^.]+$/, "") || "photo"}.${suffix}`
}

/**
 * Returns the picked files prepared for an action, leaving out the ones `prepare` rejected. When the account changed
 * while they were prepared, the action takes none of them and every prepared copy is deleted.
 */
export async function toPreparedPickedFiles({
	pickedFiles,
	prepare,
	isSameAccount,
	deleteFile,
}: {
	pickedFiles: PickedFile[]
	prepare: (pickedFile: PickedFile) => Promise<PickedFile | null>
	isSameAccount: () => boolean
	deleteFile: (pickedFile: PickedFile) => void
}): Promise<PickedFile[]> {
	// prepare one file at a time, so a resize never holds two full-size photos in memory
	const preparedFiles: PickedFile[] = []
	for (const pickedFile of pickedFiles) {
		const preparedFile = await prepare(pickedFile)
		if (preparedFile) {
			preparedFiles.push(preparedFile)
		}
	}

	// files prepared for an account that signed out belong to no one
	if (isSameAccount()) {
		return preparedFiles
	}
	for (const preparedFile of preparedFiles) {
		deleteFile(preparedFile)
	}
	return []
}
