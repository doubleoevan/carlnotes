// the stored shots of a render, with the encoder and object storage stubbed: a later attempt downloads the shots an
// earlier one stored and encodes the rest, a shot whose download fails or whose still changed is encoded again, and a
// render that keeps no shots only encodes
import { afterAll, afterEach, beforeAll, expect, mock, spyOn, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DAY_MS } from "@carlnotes/contracts/time"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as storage from "@carlnotes/db/store"
import * as videoEncode from "./videoEncode"
import { encodeVideoShots, runWithStoredVideoShots } from "./videoShotStore"

// a folder for the stills that the shots' keys are hashed from
let workDirectory: string
beforeAll(async () => {
	workDirectory = await mkdtemp(join(tmpdir(), "video-shot-store-"))
})
afterAll(async () => {
	await rm(workDirectory, { recursive: true, force: true })
})

// put the pool and every stub back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the film whose shots are kept
const FILM = { podcastEpisodeId: "episode-1", renderVersion: 3 }
const SHOT_KEY_PATTERN = /^episodes\/episode-1\/video\/shots\/v3\/[a-f0-9]{64}\.mp4$/

// one shot's run over a still with the given content, written under the shot's own name
async function toShotEncode(shotName: string, stillContent: string): Promise<videoEncode.VideoShotEncode> {
	const stillPath = join(workDirectory, `${shotName}-still.png`)
	await Bun.write(stillPath, stillContent)
	return {
		stillPath,
		zoomLimit: 1.2,
		move: "zoom-in",
		frameCount: 150,
		screenFrameCount: 150,
		previousShot: null,
		lowerThird: null,
		isSegmentStart: true,
		isSegmentEnd: false,
		shotPath: join(workDirectory, `${shotName}.mp4`),
	}
}

// what a test's run did to the encoder and to object storage
type StoreCalls = {
	encodedShotPaths: string[]
	downloadedShotKeys: string[]
	uploadedShotKeys: string[]
	sentQueries: SentQuery[]
}

// stub the encoder and object storage, with the keys that an earlier attempt stored, and record each call
function stubShotStorage(storedShotKeys: string[]): StoreCalls {
	const storeCalls: StoreCalls = {
		encodedShotPaths: [],
		downloadedShotKeys: [],
		uploadedShotKeys: [],
		sentQueries: stubConnectionPool(() => []),
	}
	spyOn(storage, "listStoredObjectKeys").mockResolvedValue(storedShotKeys)
	spyOn(videoEncode, "encodeVideoShot").mockImplementation(async ({ shotPath }) => {
		storeCalls.encodedShotPaths.push(shotPath)
	})

	// the bucket's calls are kept in place of object storage
	spyOn(storage, "downloadPodcastEpisodeFile").mockImplementation(async ({ key }) => {
		storeCalls.downloadedShotKeys.push(key)
	})
	spyOn(storage, "uploadPodcastEpisodeFile").mockImplementation(async ({ key }) => {
		storeCalls.uploadedShotKeys.push(key)
	})
	return storeCalls
}

// run one attempt of the film's render over some shots, and return what it did
async function runAttempt(
	shotEncodes: videoEncode.VideoShotEncode[],
	storedShotKeys: string[] = [],
): Promise<StoreCalls> {
	const storeCalls = stubShotStorage(storedShotKeys)
	await runWithStoredVideoShots(FILM, () => encodeVideoShots(shotEncodes))
	return storeCalls
}

test("a second attempt downloads the shots that the first stored, and encodes and stores only the rest", async () => {
	// the first attempt encodes and stores both shots, each under a key of its own with a deletion date two days out
	const shotEncodes = [await toShotEncode("first", "still one"), await toShotEncode("second", "still two")]
	const firstAttempt = await runAttempt(shotEncodes)
	expect(firstAttempt.encodedShotPaths).toEqual(shotEncodes.map((shotEncode) => shotEncode.shotPath))
	expect(firstAttempt.uploadedShotKeys).toHaveLength(2)
	expect(firstAttempt.uploadedShotKeys.every((shotKey) => SHOT_KEY_PATTERN.test(shotKey))).toBe(true)
	expect(new Set(firstAttempt.uploadedShotKeys).size).toBe(2)

	// the deletion date of both shots is recorded in one write before the uploads
	const [deletionWrite] = firstAttempt.sentQueries
	expect(deletionWrite?.text).toStartWith('insert into "pending_object_deletions"')
	expect(deletionWrite?.values).toEqual(expect.arrayContaining(firstAttempt.uploadedShotKeys))
	const deletionDates = deletionWrite?.values.filter((value) => !SHOT_KEY_PATTERN.test(String(value))) ?? []
	expect(deletionDates).toHaveLength(2)
	expect(Date.parse(String(deletionDates[0])) - Date.now()).toBeGreaterThan(2 * DAY_MS - 60_000)

	// the second attempt finds the first shot stored: it downloads that one, and encodes and stores the other alone
	const [firstShotKey, secondShotKey] = firstAttempt.uploadedShotKeys as [string, string]
	const secondAttempt = await runAttempt(shotEncodes, [firstShotKey])
	expect(secondAttempt.downloadedShotKeys).toEqual([firstShotKey])
	expect(secondAttempt.encodedShotPaths).toEqual([shotEncodes[1]?.shotPath as string])
	expect(secondAttempt.uploadedShotKeys).toEqual([secondShotKey])
})

test("a stored shot that fails to download is encoded again", async () => {
	// the shot is stored, and its download fails as it does once the sweep has deleted the shot
	const shotEncodes = [await toShotEncode("gone", "still")]
	const [storedShotKey] = (await runAttempt(shotEncodes)).uploadedShotKeys as [string]
	const storeCalls = stubShotStorage([storedShotKey])
	spyOn(storage, "downloadPodcastEpisodeFile").mockRejectedValue(new Error("NoSuchKey"))
	await runWithStoredVideoShots(FILM, () => encodeVideoShots(shotEncodes))

	// the shot is encoded and stored under the same key
	expect(storeCalls.encodedShotPaths).toEqual([shotEncodes[0]?.shotPath as string])
	expect(storeCalls.uploadedShotKeys).toEqual([storedShotKey])
})

test("a still drawn again with other content gives its shot another key, so the shot is encoded again", async () => {
	// the same shot over the same file name, with the still's content changed between the attempts
	const [storedShotKey] = (await runAttempt([await toShotEncode("redrawn", "the first drawing")])).uploadedShotKeys
	const secondAttempt = await runAttempt([await toShotEncode("redrawn", "the second drawing")], [storedShotKey ?? ""])
	expect(secondAttempt.downloadedShotKeys).toEqual([])
	expect(secondAttempt.uploadedShotKeys).toHaveLength(1)
	expect(secondAttempt.uploadedShotKeys[0]).not.toBe(storedShotKey)
})

test("a rebuild, which keeps no shots, and a render whose listing failed only encode", async () => {
	// outside a render that keeps its shots, the encoder runs and object storage is never called
	const shotEncodes = [await toShotEncode("rebuilt", "still")]
	const rebuildCalls = stubShotStorage([])
	await encodeVideoShots(shotEncodes)
	expect(rebuildCalls.encodedShotPaths).toEqual([shotEncodes[0]?.shotPath as string])
	expect([rebuildCalls.uploadedShotKeys, rebuildCalls.sentQueries]).toEqual([[], []])

	// a render whose listing failed encodes too, and stores nothing
	mock.restore()
	const failedListingCalls = stubShotStorage([])
	spyOn(storage, "listStoredObjectKeys").mockRejectedValue(new Error("the bucket is down"))
	await runWithStoredVideoShots(FILM, () => encodeVideoShots(shotEncodes))
	expect(failedListingCalls.encodedShotPaths).toEqual([shotEncodes[0]?.shotPath as string])
	expect(failedListingCalls.uploadedShotKeys).toEqual([])
})

test("an upload that fails leaves the encoded shot for the render, and the render goes on", async () => {
	const shotEncodes = [await toShotEncode("unstored", "still")]
	const storeCalls = stubShotStorage([])
	spyOn(storage, "uploadPodcastEpisodeFile").mockRejectedValue(new Error("the bucket is down"))
	await runWithStoredVideoShots(FILM, () => encodeVideoShots(shotEncodes))
	expect(storeCalls.encodedShotPaths).toEqual([shotEncodes[0]?.shotPath as string])
})
