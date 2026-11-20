// a render's stored shots: each shot a render encodes is kept in object storage under a key that names what the shot
// was encoded from, so a later attempt of the render downloads the shot instead of encoding it again. a render lists
// its stored shots once, and every segment encoded inside the render's run goes through the listing

import { AsyncLocalStorage } from "node:async_hooks"
import { DAY_MS } from "@carlnotes/contracts/time"
import { db } from "@carlnotes/db"
import {
	downloadPodcastEpisodeFile,
	listStoredObjectKeys,
	recordPendingObjectDeletions,
	uploadPodcastEpisodeFile,
} from "@carlnotes/db/store"
import { toTopicVideoShotKey, toTopicVideoShotKeyPrefix } from "@carlnotes/db/topicVideoKeys"
import { reportError } from "@carlnotes/server/monitoring"
import { encodeVideoShot, toVideoShotArguments, type VideoShotEncode } from "./videoEncode"
import { sha256Hash } from "./videoScenePlan"

// how long a stored shot is kept if no render deletes it first. two days are past a render's three attempts and one
// restart by the reaper, and the sweep deletes the shot after them
const STORED_SHOT_LIFETIME_MS = 2 * DAY_MS

// the stored shots of the render that is running: the prefix of their keys, and the keys that earlier attempts stored
type StoredVideoShots = { shotKeyPrefix: string; storedShotKeys: Set<string> }
const storedVideoShots = new AsyncLocalStorage<StoredVideoShots>()

// the film whose shots are kept, and the render version the shots are encoded at
type StoredVideoShotsOptions = { podcastEpisodeId: string; renderVersion: number }

/**
 * Runs a render that keeps its shots: lists the shots that earlier attempts of the render stored, once, then runs the
 * render with that listing, so each segment downloads its stored shots and stores the shots it encodes. A listing that
 * fails is reported, and the render then encodes every shot and stores none.
 */
export async function runWithStoredVideoShots<RenderResult>(
	{ podcastEpisodeId, renderVersion }: StoredVideoShotsOptions,
	runRender: () => Promise<RenderResult>,
): Promise<RenderResult> {
	const shotKeyPrefix = toTopicVideoShotKeyPrefix(podcastEpisodeId, renderVersion)
	const storedShotKeys = await listStoredObjectKeys(shotKeyPrefix).catch((error: unknown) => {
		reportError(error, "topic-video", { podcastEpisodeId, step: "stored-shots-list" })
		return null
	})

	// the render, and every segment it encodes, reads the listing
	return storedShotKeys
		? storedVideoShots.run({ shotKeyPrefix, storedShotKeys: new Set(storedShotKeys) }, runRender)
		: runRender()
}

/**
 * Encodes a segment's shots in order, each to its own file. Inside a render that keeps its shots, a shot that an
 * earlier attempt stored is downloaded instead, a stored shot that fails to download is encoded, and each encoded shot
 * is stored while the next one encodes. A shot that cannot be stored is reported and leaves the render as it is.
 */
export async function encodeVideoShots(videoShotEncodes: VideoShotEncode[], signal?: AbortSignal): Promise<void> {
	// each shot's key, and the deletion date of the shots this run stores. a rebuild keeps no shots
	const shotKeys = await toNewShotKeys(videoShotEncodes)
	const uploads: Promise<void>[] = []
	for (const [i, videoShotEncode] of videoShotEncodes.entries()) {
		// a stored shot is downloaded
		const shotKey = shotKeys?.[i]
		const isStored = shotKey !== undefined && storedVideoShots.getStore()?.storedShotKeys.has(shotKey)
		if (isStored && (await downloadStoredShot(shotKey, videoShotEncode.shotPath, signal))) {
			continue
		}

		// any other shot is encoded, and stored while the shots after it encode
		await encodeVideoShot(videoShotEncode, signal)
		if (shotKey !== undefined) {
			uploads.push(storeShot(shotKey, videoShotEncode.shotPath, signal))
		}
	}

	// the shots' files are deleted once their segment is joined, so every upload ends first
	await Promise.all(uploads)
}

// the key of each of a segment's shots, with a deletion date recorded for the ones not stored yet, or null if the
// render keeps no shots or the date cannot be recorded
async function toNewShotKeys(videoShotEncodes: VideoShotEncode[]): Promise<string[] | null> {
	const videoShots = storedVideoShots.getStore()
	if (!videoShots) {
		return null
	}
	try {
		// hash each input file once, however many of the segment's shots show it
		const contentHashByPath = new Map<string, string>()
		const shotKeys: string[] = []
		for (const videoShotEncode of videoShotEncodes) {
			const shotHash = await toVideoShotHash(videoShotEncode, contentHashByPath)
			shotKeys.push(toTopicVideoShotKey(videoShots.shotKeyPrefix, shotHash))
		}

		// the deletion date goes first, so a render that dies leaves no shot that the sweep never deletes
		const newShotKeys = [...new Set(shotKeys)].filter((shotKey) => !videoShots.storedShotKeys.has(shotKey))
		const nextTryAt = new Date(Date.now() + STORED_SHOT_LIFETIME_MS)
		await recordPendingObjectDeletions({ handle: db, objectKeys: newShotKeys, nextTryAt })
		return shotKeys
	} catch (error) {
		// a segment whose shots cannot be recorded is encoded, and none of its shots is stored
		reportError(error, "topic-video", { step: "stored-shots-keys" })
		return null
	}
}

// what a shot is encoded from, as one hash: ffmpeg's arguments, with the content hash of each input file in place of
// the file's path, and no output path. a still drawn again with other content gives the shot another hash
async function toVideoShotHash(
	videoShotEncode: VideoShotEncode,
	contentHashByPath: Map<string, string>,
): Promise<string> {
	// the files the shot may read: its picture's and the picture's before it, and the lower third
	const shotPictures = [videoShotEncode, ...(videoShotEncode.previousShot ? [videoShotEncode.previousShot] : [])]
	const inputPaths = new Set<string | undefined>([
		...shotPictures.flatMap((shotPicture) => [shotPicture.stillPath, shotPicture.reviewedAnimationPath]),
		videoShotEncode.lowerThird?.lowerThirdPath,
	])

	// hash the files that the arguments name, and put each hash in its path's place
	const hashedArguments: string[] = []
	for (const shotArgument of toVideoShotArguments({ ...videoShotEncode, shotPath: "" })) {
		// a file that several of the segment's shots show is hashed once
		if (inputPaths.has(shotArgument) && !contentHashByPath.has(shotArgument)) {
			contentHashByPath.set(shotArgument, sha256Hash(await Bun.file(shotArgument).bytes()))
		}
		hashedArguments.push(contentHashByPath.get(shotArgument) ?? shotArgument)
	}
	return sha256Hash(JSON.stringify(hashedArguments))
}

// download a stored shot to its file, and return whether it arrived. a shot that the sweep deleted meanwhile, or whose
// download failed, leaves no file and is encoded instead
async function downloadStoredShot(shotKey: string, shotPath: string, signal?: AbortSignal): Promise<boolean> {
	try {
		await downloadPodcastEpisodeFile({ key: shotKey, filePath: shotPath, signal })
		return true
	} catch {
		// a render that was stopped ends here, and any other failure encodes the shot
		signal?.throwIfAborted()
		await Bun.file(shotPath)
			.delete()
			.catch(() => undefined)
		return false
	}
}

// store one encoded shot. a failed upload is reported, and the next attempt encodes the shot again
async function storeShot(shotKey: string, shotPath: string, signal?: AbortSignal): Promise<void> {
	try {
		await uploadPodcastEpisodeFile({ key: shotKey, filePath: shotPath, contentType: "video/mp4", signal })
	} catch (error) {
		// a render that was stopped reports nothing
		if (!signal?.aborted) {
			reportError(error, "topic-video", { step: "stored-shots-upload" })
		}
	}
}
