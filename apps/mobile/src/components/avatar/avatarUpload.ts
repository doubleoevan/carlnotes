import { AVATAR_ACCEPT, AVATAR_JPEG_QUALITY, MAX_AVATAR_PIXELS } from "@carlnotes/core/lib/imageUpload"
import { toCurrentChatAccountGuard } from "@carlnotes/core/stores/chatConversationStore"
import { useEffect, useRef } from "react"
import { useFilePicker } from "@/components/common/FilePickerMenu"
import { deletePickedFile, toReadablePickedFile } from "@/components/common/pickedFileCache"
import { type PickedFile, toPreparedPickedFiles } from "@/pickedFiles"

/**
 * Opens the picker menu for a user or Team avatar: Photo library, Take photo, and Files limited to images. The picked
 * image is re-encoded at the web's avatar size without its metadata, a png if it can be transparent, and returned as
 * the multipart body the avatar routes take. Its copy is deleted once `onPicked` finishes. A copy `isFileKept` holds
 * for a later save is deleted when another image replaces it or the picker's view closes.
 */
export function useAvatarPicker({
	onPicked,
	isFileKept = false,
}: {
	onPicked: (body: FormData) => Promise<void>
	isFileKept?: boolean
}): ReturnType<typeof useFilePicker> {
	// the copy held for a later save, deleted when the view closes
	const keptFileRef = useRef<PickedFile | null>(null)
	useEffect(
		() => () => {
			if (keptFileRef.current) {
				deletePickedFile(keptFileRef.current)
			}
		},
		[],
	)
	return useFilePicker({
		accept: AVATAR_ACCEPT.split(","),
		onPicked: async (pickedFiles) => {
			// resize to the avatar edge for the account that picked it, or stop after the unreadable-image notice
			const [avatarFile] = await toPreparedPickedFiles({
				pickedFiles,
				prepare: (pickedFile) =>
					toReadablePickedFile(pickedFile, { maxPixels: MAX_AVATAR_PIXELS, jpegQuality: AVATAR_JPEG_QUALITY }),
				isSameAccount: toCurrentChatAccountGuard(),
				deleteFile: deletePickedFile,
			})
			if (!avatarFile) {
				return
			}

			// send the body, then delete the copy unless a later save reads it
			try {
				await onPicked(toAvatarBody(avatarFile))
			} finally {
				// a held copy replaces the one held before, which is deleted
				const deletedFile = isFileKept ? keptFileRef.current : avatarFile
				if (isFileKept) {
					keptFileRef.current = avatarFile
				}
				if (deletedFile) {
					deletePickedFile(deletedFile)
				}
			}
		},
	})
}

// a resized avatar as the multipart body. React Native's multipart transport takes a local file descriptor in place
// of a browser File
function toAvatarBody(avatarFile: PickedFile): FormData {
	const body = new FormData()
	body.append("avatar", {
		uri: avatarFile.uri,
		name: avatarFile.name,
		type: avatarFile.mimeType,
	} as unknown as Blob)
	return body
}
