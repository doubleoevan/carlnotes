// the delete for one file that the app wrote to its cache: a picked copy, a spoken part, or a recording
import { File } from "expo-file-system"

/**
 * Deletes a cache file by its uri. A file already gone is ignored, and a delete that the platform rejects is logged and
 * leaves the file for the next sweep.
 */
export function deleteCacheFile(uri: string): void {
	try {
		// delete the file if it is still there
		const file = new File(uri)
		if (file.exists) {
			file.delete()
		}
	} catch (error) {
		console.warn("cache file delete failed", error)
	}
}
