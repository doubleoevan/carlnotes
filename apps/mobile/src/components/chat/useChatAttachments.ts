// the draft's attachments, read from the files the app's pickers return

import { showClientError } from "@carlnotes/client/apiClient"
import {
	type ChatAttachments,
	useChatAttachments as useSharedChatAttachments,
} from "@carlnotes/core/hooks/useChatAttachments"
import type { ChatAttachmentFileReader } from "@carlnotes/core/lib/chatAttachmentRules"
import { toCurrentChatAccountGuard } from "@carlnotes/core/stores/chatConversationStore"
import { File } from "expo-file-system"
import { deletePickedFile, toReadablePickedFile } from "@/components/common/pickedFileCache"
import { type PickedFile, toPreparedPickedFiles } from "@/pickedFiles"

// the shared draft state, taking picked files in place of the files the shared hook reads
export type PickedChatAttachments = Omit<ChatAttachments<PickedFile>, "addAttachmentFiles"> & {
	addPickedFiles: (pickedFiles: PickedFile[], options?: { isTakenFileRetained?: boolean }) => Promise<PickedFile[]>
	// the history shows a sent file by name alone, so a sent chat turn keeps no data url
	isSentMediaPreviewed: false
}

/**
 * The attachments one question holds and the ones the topic keeps, read from picked files. A photo is resized
 * before it is read. Every picked copy is deleted once the draft holds its data url, except the taken files a caller
 * retains for an upload of its own. A chat room's message keeps nothing.
 */
export function useChatAttachments({ isRoom = false }: { isRoom?: boolean } = {}): PickedChatAttachments {
	const { addAttachmentFiles, ...chatAttachments } = useSharedChatAttachments({
		toFileReader: toPickedFileReader,
		notify: showClientError,
		isRoom,
	})

	// resize the photos for the account that picked them, take the files in, and delete the cached copies the draft
	// no longer needs. the taken files return for a caller that also uploads them
	async function addPickedFiles(
		pickedFiles: PickedFile[],
		{ isTakenFileRetained = false }: { isTakenFileRetained?: boolean } = {},
	): Promise<PickedFile[]> {
		const preparedFiles = await toPreparedPickedFiles({
			pickedFiles,
			prepare: toReadablePickedFile,
			isSameAccount: toCurrentChatAccountGuard(),
			deleteFile: deletePickedFile,
		})

		// add the prepared files to the draft
		let takenFiles: PickedFile[] = []
		try {
			takenFiles = await addAttachmentFiles(preparedFiles)
		} finally {
			// a taken file the caller retains stays for its upload, and every other copy is deleted
			for (const preparedFile of preparedFiles) {
				if (!isTakenFileRetained || !takenFiles.includes(preparedFile)) {
					deletePickedFile(preparedFile)
				}
			}
		}
		return takenFiles
	}

	// the shared attachment state, with the native pick added
	return { ...chatAttachments, addPickedFiles, isSentMediaPreviewed: false }
}

// a picked file as the shared rules read it, through the file system's own reader
function toPickedFileReader(pickedFile: PickedFile): ChatAttachmentFileReader {
	return {
		name: pickedFile.name,
		mimeType: pickedFile.mimeType,
		byteSize: pickedFile.byteSize,
		readDataUrl: async () => `data:${pickedFile.mimeType};base64,${await new File(pickedFile.uri).base64()}`,
		readText: () => new File(pickedFile.uri).text(),
	}
}
