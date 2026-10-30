// a signed-in download opened in the system preview, with the downloaded copies deleted when the view leaves

import { fetchApi, readApiErrorMessage } from "@carlnotes/client/apiClient"
import { Directory, File, Paths } from "expo-file-system"
import { useEffect, useRef } from "react"
import { DOWNLOADED_PREVIEW_FOLDER, deletePickedFile } from "./pickedFileCache"

/**
 * Returns the call that downloads a file through the app's signed-in session and opens it in the system preview.
 * The downloaded copies are deleted when the calling view unmounts.
 */
export function useDownloadedFilePreview(): (download: { path: string; filename: string }) => Promise<void> {
	// keep files available while the system preview is open, then remove them with the calling view
	const isMountedRef = useRef(true)
	const downloadedFilesRef = useRef<File[]>([])
	useEffect(() => {
		isMountedRef.current = true
		return () => {
			isMountedRef.current = false
			// delete the downloads this view wrote
			for (const file of downloadedFilesRef.current.splice(0)) {
				deletePickedFile(file)
			}
		}
	}, [])

	// download before opening the preview. private files never depend on the browser's separate session
	return async ({ path, filename }) => {
		const response = await fetchApi(path)
		if (!response.ok) {
			throw new Error((await readApiErrorMessage(response)) ?? "That file could not be downloaded.")
		}
		// read the bytes, unless the view closed meanwhile
		const bytes = new Uint8Array(await response.arrayBuffer())
		if (!isMountedRef.current) {
			return
		}

		// write the download to a tracked preview file in the folder a launch or an account change empties
		const safeFilename = filename.replace(/[/\\]/g, "_")
		const folder = new Directory(Paths.cache, DOWNLOADED_PREVIEW_FOLDER)
		folder.create({ idempotent: true })
		const file = new File(folder, `${Date.now()}-${safeFilename}`)
		downloadedFilesRef.current.push(file)
		file.writeSync(bytes)
		await file.preview({ title: filename })
	}
}
