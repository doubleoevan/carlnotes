// decode the second shot in a rebuilt Comment segment to identify the poster it actually shows
import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { toTopicVideoChaptersKey, toTopicVideoRenderAttemptUploadKey } from "@carlnotes/db/topicVideoKeys"
import { runFfmpeg } from "@carlnotes/models/ffmpeg"
import sharp from "sharp"
import { rebuildVideoChapters } from "./rebuildVideoChapters"
import { sha256Hash, toVideoScenePlansHash } from "./videoScenePlan"
import type { VideoSegment } from "./videoTimeline"

test.skipIf(!Bun.which("ffmpeg"))(
	"a Comment shows the approved replacement poster in the re-encoded frames",
	async () => {
		// the published chapters show a red poster after the first shot, and the approved replacement is green
		const episode = "episode-1"
		const segments: VideoSegment[] = [{ kind: "hot-takes", position: 0, startSeconds: 0, frameCount: 240 }]
		const solid = (background: string): Promise<Buffer> =>
			sharp({ create: { width: 1280, height: 720, channels: 3, background } })
				.png()
				.toBuffer()
		const [oldPoster, newPoster, hosts] = await Promise.all([solid("#ff0000"), solid("#00ff00"), solid("#000000")])
		const publishedHash = toVideoScenePlansHash([], [], sha256Hash(oldPoster))
		const chaptersKey = toTopicVideoRenderAttemptUploadKey(
			toTopicVideoChaptersKey(episode, 4, publishedHash),
			crypto.randomUUID(),
		)

		// rebuild through the normal chapter encoder, without a storage service or a model
		const workDirectory = await mkdtemp(join(tmpdir(), "film-poster-rebuild-"))
		try {
			const chapters = await rebuildVideoChapters({
				podcastEpisodeId: episode,
				ownerId: "owner",
				workDirectory,
				renderVersion: 4,
				chaptersKey,
				segments,
				captionCues: [],
				shownImageStill: { stillPng: newPoster, zoomLimit: 1, isPodcastCard: false },
				preparedChapterImages: {
					chapterImages: new Map(),
					sceneSources: [],
					firstChapterImages: [],
					newlyGeneratedChapterImageCount: 0,
					podcastCardImages: [hosts, newPoster].map((picture) => ({ loadStillPng: async () => picture, zoomLimit: 1 })),
				},
			})
			expect(chapters.scenePlansHash).toEqual(toVideoScenePlansHash([], [], sha256Hash(newPoster)))

			// sample the displayed second shot away from the lower third and the closing fade
			const pixel = await runFfmpeg({
				ffmpegArguments: [
					"-ss",
					"9",
					"-i",
					chapters.path,
					"-frames:v",
					"1",
					"-vf",
					"crop=16:16:640:360,scale=1:1,format=rgb24",
					"-f",
					"rawvideo",
					"pipe:1",
				],
			})
			expect(pixel).toHaveLength(3)
			expect(pixel[0]).toBeLessThan(20)
			expect(pixel[1]).toBeGreaterThan(220)
			expect(pixel[2]).toBeLessThan(20)
		} finally {
			await rm(workDirectory, { recursive: true, force: true })
		}
	},
	60_000,
)
