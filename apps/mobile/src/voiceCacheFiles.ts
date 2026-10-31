// the voice's transient cache files: a spoken part's written file, and the sweep that deletes every spoken part and
// recording file that a crash or an ended session left behind
import { Directory, File, Paths } from "expo-file-system"
import { deleteCacheFile } from "./cacheFiles"
import { SPOKEN_PART_FILE_PREFIX, type SpokenPartFile } from "./spokenAnswerAudio"
import { VOICE_RECORDING_FILE_PREFIX } from "./voiceRecorder"

// the recorder's own folders under the cache: iOS writes to ExpoAudio and Android to Audio
const RECORDER_FOLDER_NAMES = ["ExpoAudio", "Audio"]

/**
 * Writes a spoken part's bytes to its own cache file, and returns the file to play and delete.
 */
export async function writeSpokenPartFile(fileName: string, bytes: Uint8Array): Promise<SpokenPartFile> {
	const file = new File(Paths.cache, fileName)
	await file.write(bytes)
	return { uri: file.uri, delete: () => deleteCacheFile(file.uri) }
}

/**
 * Deletes every spoken part and recording file in the cache.
 */
export function deleteVoiceCacheFiles(): void {
	// the cache itself holds the spoken parts, and the recorder's folders hold the recordings
	const folders = [Paths.cache, ...RECORDER_FOLDER_NAMES.map((folderName) => new Directory(Paths.cache, folderName))]
	for (const folder of folders) {
		// skip a folder the recorder never made
		try {
			if (!folder.exists) {
				continue
			}

			// delete the voice's own files, and nothing else in the folder
			for (const fileOrDirectory of folder.list()) {
				if (fileOrDirectory instanceof File && isVoiceCacheFileName(fileOrDirectory.name)) {
					deleteCacheFile(fileOrDirectory.uri)
				}
			}
		} catch (error) {
			// a folder that cannot be read waits for the next sweep
			console.warn("voice cache sweep failed", error)
		}
	}
}

// whether a cache file is a spoken part's or a recording's
function isVoiceCacheFileName(fileName: string): boolean {
	return fileName.startsWith(SPOKEN_PART_FILE_PREFIX) || fileName.startsWith(VOICE_RECORDING_FILE_PREFIX)
}
