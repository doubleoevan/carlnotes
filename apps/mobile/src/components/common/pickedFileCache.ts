// the resized re-encodes of picked images, and the cached copies the pickers, the resizer, and the previews leave behind

import { showClientError } from "@carlnotes/client/apiClient"
import { MAX_ATTACHMENT_IMAGE_PIXELS, toResizedImage, UNREADABLE_IMAGE_TEXT } from "@carlnotes/core/lib/imageUpload"
import { Directory, File, Paths } from "expo-file-system"
import { ImageManipulator, SaveFormat } from "expo-image-manipulator"
import { deleteCacheFile } from "@/cacheFiles"
import { isPickedImage, type PickedFile, toRenamedFileName } from "@/pickedFiles"

// the jpeg quality an attached photo re-encodes at
const ATTACHMENT_JPEG_QUALITY = 0.85

// the cache folder the system preview's downloads are written to
export const DOWNLOADED_PREVIEW_FOLDER = "DownloadedPreviews"

// the cache folders the document picker, the image picker, the resizer, and the previews write their copies to
const FILE_CACHE_FOLDERS = ["DocumentPicker", "ImagePicker", "ImageManipulator", DOWNLOADED_PREVIEW_FOLDER]

/**
 * Returns a picked image resized to the longest edge allowed and re-encoded without its metadata, a png for an image
 * that can be transparent and a jpeg for every other image. Anything other than an image returns unchanged. The
 * picked copy is deleted once the re-encode is written. An image that cannot be read returns null after a notice.
 */
export async function toReadablePickedFile(
	pickedFile: PickedFile,
	{ maxPixels = MAX_ATTACHMENT_IMAGE_PIXELS, jpegQuality = ATTACHMENT_JPEG_QUALITY } = {},
): Promise<PickedFile | null> {
	if (!isPickedImage(pickedFile)) {
		return pickedFile
	}
	try {
		// decode already scaled to the longest edge allowed, so a full-size photo never fills memory
		const context = ImageManipulator.manipulate(pickedFile.uri, { maxWidth: maxPixels, maxHeight: maxPixels })
		const image = await context.renderAsync()
		const resizedImage = toResizedImage({
			width: image.width,
			height: image.height,
			mimeType: pickedFile.mimeType,
			maxPixels,
		})

		// re-encode, a png if the image can be transparent, and free the decoded image
		const savedImage = await image.saveAsync({
			format: resizedImage.isTransparencyKept ? SaveFormat.PNG : SaveFormat.JPEG,
			compress: jpegQuality,
		})
		context.release()
		image.release()

		// the re-encode replaces the picked copy, which is no longer needed
		deletePickedFile(pickedFile)
		return {
			uri: savedImage.uri,
			name: toRenamedFileName(pickedFile.name, resizedImage.suffix),
			mimeType: resizedImage.mimeType,
			byteSize: new File(savedImage.uri).size ?? 0,
		}
	} catch (error) {
		// an image the resizer could not read becomes a notice, and its copy is deleted
		console.warn("image resize failed", error)
		deletePickedFile(pickedFile)
		showClientError(UNREADABLE_IMAGE_TEXT)
		return null
	}
}

/**
 * Returns a picked file with its byte size read from its copy when the picker reported none, so the size limits
 * apply before the file is read.
 */
export function toMeasuredPickedFile(pickedFile: PickedFile): PickedFile {
	return pickedFile.byteSize > 0 ? pickedFile : { ...pickedFile, byteSize: new File(pickedFile.uri).size ?? 0 }
}

/**
 * Deletes a picked file's cached copy. A copy already gone is ignored.
 */
export function deletePickedFile(pickedFile: Pick<PickedFile, "uri">): void {
	deleteCacheFile(pickedFile.uri)
}

/**
 * Empties the pickers', the resizer's, and the previews' cache folders, for the copies a closed or crashed screen or
 * another account left behind.
 */
export function clearFileCaches(): void {
	for (const folderName of FILE_CACHE_FOLDERS) {
		// delete each folder that exists
		try {
			const folder = new Directory(Paths.cache, folderName)
			if (folder.exists) {
				folder.delete()
			}
		} catch (error) {
			// a folder that cannot be deleted waits for the next launch
			console.warn("file cache clear failed", error)
		}
	}
}
