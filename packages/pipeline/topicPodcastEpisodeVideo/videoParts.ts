// a podcast episode film's three parts on local files: the intro, the chapters, and the sign-off, and the film joined
// from them. the render and the rebuild both draw through here. a chapter is a montage, one run for each of its shots,
// and a segment's stills and lower third are deleted once its shots are encoded. every ffmpeg run stops once the
// signal aborts

import { join } from "node:path"
import { reportError } from "@carlnotes/server/monitoring"
import {
	encodeVideoImagePart,
	encodeVideoShot,
	joinVideo,
	muxFilm,
	remuxFilm,
	type VideoShotEncode,
	type VideoShotPicture,
	writeConcatList,
} from "./videoEncode"
import { type LowerThirdText, loadPodcastCardStillPng, PODCAST_CARD_ZOOM_LIMIT, toLowerThirdPng } from "./videoFrames"
import { HOT_TAKES_LOWER_THIRD_TEXT } from "./videoHotTakes"
import { toCaptionBreakFrames, toShotScreenFrameCount, toVideoShots, type VideoShot } from "./videoShots"
import { LOWER_THIRD_OUT_SECONDS, toSegmentSeconds, VIDEO_FRAMES_PER_SECOND, type VideoSegment } from "./videoTimeline"

// one image a segment's shots show: the load of its still, composed at four times the film's size, and how far the
// image may zoom
export type VideoSegmentImage = { loadStillPng: () => Promise<Uint8Array>; zoomLimit: number }

// one chapter's images in the order its shots show them, and its lower third
export type VideoChapterImages = { images: VideoSegmentImage[]; lowerThirdText: LowerThirdText }

// the folder that the render works in, the film's timeline, the still of the image the film shows with the intro's
// and the sign-off's lower thirds, and the signal that stops the encodes
type RenderVideoImagePartsOptions = {
	workDirectory: string
	segments: VideoSegment[]
	shownImageStillPng: Uint8Array
	introText: LowerThirdText
	signOffText: LowerThirdText
	signal?: AbortSignal
}

// the parts drawn from the image the film shows, null for a part the timeline has no frames for
export type VideoImagePartPaths = { introPath: string | null; signOffPath: string | null }

/**
 * Renders the intro and the sign-off, the parts that show the film's own image or else its podcast episode's, and
 * returns their files. The still and the lower thirds are deleted once the parts are encoded.
 */
export async function renderVideoImageParts({
	workDirectory,
	segments,
	shownImageStillPng,
	introText,
	signOffText,
	signal,
}: RenderVideoImagePartsOptions): Promise<VideoImagePartPaths> {
	// write the still once for both parts
	const stillPath = join(workDirectory, "shown-image-still.png")
	await Bun.write(stillPath, shownImageStillPng)

	// render both parts from the same still, then delete it
	const imagePart = { workDirectory, segments, stillPath, signal }
	const introPath = await renderVideoImagePart({ ...imagePart, part: "intro", lowerThirdText: introText })
	const signOffPath = await renderVideoImagePart({ ...imagePart, part: "sign-off", lowerThirdText: signOffText })
	await Bun.file(stillPath).delete()
	return { introPath, signOffPath }
}

// the folder that the render works in, the timeline, the still's file, the part with its lower third, and the signal
// that stops the encode
type RenderVideoImagePartOptions = {
	workDirectory: string
	segments: VideoSegment[]
	stillPath: string
	part: "intro" | "sign-off"
	lowerThirdText: LowerThirdText
	signal?: AbortSignal
}

// render one part that shows the film's image: one run with its lower third shown throughout. a part the timeline has
// no frames for returns null
async function renderVideoImagePart({
	workDirectory,
	segments,
	stillPath,
	part,
	lowerThirdText,
	signal,
}: RenderVideoImagePartOptions): Promise<string | null> {
	// find the part's segment
	const segment = segments.find((timelineSegment) => timelineSegment.kind === part)
	if (!segment) {
		return null
	}

	// draw the lower third, then encode the part
	const lowerThirdPath = join(workDirectory, `${part}-lower-third.png`)
	await Bun.write(lowerThirdPath, await toLowerThirdPng(lowerThirdText))
	const partPath = join(workDirectory, `${part}.mp4`)
	await encodeVideoImagePart({ stillPath, lowerThirdPath, frameCount: segment.frameCount, part, partPath }, signal)

	// delete the lower third once the part is encoded
	await Bun.file(lowerThirdPath).delete()
	return partPath
}

// the film's podcast episode, the folder that the render works in, the film's timeline, each chapter's images by its
// position, the images that the segments where the hosts answer Comments cut between, when each caption starts in the
// audio, and the signal that stops the encodes and the join
type RenderVideoChaptersPartOptions = {
	podcastEpisodeId: string
	workDirectory: string
	segments: VideoSegment[]
	// what each segment shows, and where its shots may cut
	chapterImages: Map<number, VideoChapterImages>
	podcastCardImages: VideoSegmentImage[]
	captionStartSeconds: number[]
	signal?: AbortSignal
}

/**
 * Renders every chapter's shots and the shots of every segment where the hosts answer Comments, and joins them into
 * the chapters part by stream copy. Each segment's stills and lower third are deleted once its shots are encoded, and
 * each shot's file once the part is joined. Returns the part's file, or null if the timeline has no chapters.
 */
export async function renderVideoChaptersPart({
	podcastEpisodeId,
	workDirectory,
	segments,
	chapterImages,
	podcastCardImages,
	captionStartSeconds,
	signal,
}: RenderVideoChaptersPartOptions): Promise<string | null> {
	// encode the segments one at a time, so the render holds one segment's stills on disk
	const shotPaths: string[] = []
	for (const segment of segments) {
		if (segment.kind !== "chapter" && segment.kind !== "hot-takes") {
			continue
		}

		// a chapter shows its own images under its own lower third, and the hosts' answers show the podcast card's
		const chapter = segment.kind === "chapter" ? chapterImages.get(segment.position) : undefined
		if (segment.kind === "chapter" && !chapter) {
			throw new Error(`the film has no chapter at position ${segment.position}`)
		}
		const segmentShotPaths = await renderSegmentShots({
			podcastEpisodeId,
			workDirectory,
			segment,
			images: chapter?.images ?? podcastCardImages,
			lowerThirdText: chapter?.lowerThirdText ?? HOT_TAKES_LOWER_THIRD_TEXT,
			captionStartSeconds,
			signal,
		})
		shotPaths.push(...segmentShotPaths)
	}

	// a timeline with no chapters has no chapters part
	if (shotPaths.length === 0) {
		return null
	}

	// join the shots by stream copy
	const chaptersPath = join(workDirectory, "chapters.mp4")
	const listPath = join(workDirectory, "chapter-shots.txt")
	await writeConcatList(shotPaths, listPath)
	await joinVideo({ listPath, outputPath: chaptersPath }, signal)

	// delete the shots' files once the part is joined
	await Promise.all(shotPaths.map((shotPath) => Bun.file(shotPath).delete()))
	return chaptersPath
}

// the film's podcast episode, the folder that the render works in, the segment, its images in the order its shots show
// them, its lower third, when each caption starts in the audio, and the signal that stops the encodes
type RenderSegmentShotsOptions = {
	podcastEpisodeId: string
	workDirectory: string
	segment: Extract<VideoSegment, { kind: "chapter" | "hot-takes" }>
	// what the segment shows, and where its shots may cut
	images: VideoSegmentImage[]
	lowerThirdText: LowerThirdText
	captionStartSeconds: number[]
	signal?: AbortSignal
}

// one of a segment's stills on disk, and how far its image may zoom
type SegmentStill = { stillPath: string; zoomLimit: number }

// render one segment as its shots, one run each, and return the shots' files in order
async function renderSegmentShots({
	podcastEpisodeId,
	workDirectory,
	segment,
	images,
	lowerThirdText,
	captionStartSeconds,
	signal,
}: RenderSegmentShotsOptions): Promise<string[]> {
	// plan the cuts first to learn how many stills the segment's shots can show
	const { frameCount, startSeconds: segmentStartSeconds } = segment
	const shotPlan = {
		frameCount,
		captionBreakFrames: toCaptionBreakFrames({ captionStartSeconds, segmentStartSeconds, frameCount }),
		seed: `${podcastEpisodeId}:${segment.kind}:${segment.position}`,
	}
	const shotCount = toVideoShots({ ...shotPlan, imageCount: images.length }).length

	// write the stills and the lower third, then plan the shots over the stills that loaded
	const filePrefix = join(workDirectory, `${segment.kind}-${segment.position}`)
	const segmentStills = await writeSegmentStills({
		podcastEpisodeId,
		filePrefix,
		images,
		stillCount: shotCount,
		signal,
	})
	const lowerThirdPath = `${filePrefix}-lower-third.png`
	await Bun.write(lowerThirdPath, await toLowerThirdPng(lowerThirdText))
	const shots = toVideoShots({ ...shotPlan, imageCount: segmentStills.length })

	// encode each shot, with the shot before it for its crossfade
	const shotPictures = shots.map((shot, i) =>
		toShotPicture({ shot, segmentStills, isLastShot: i === shots.length - 1 }),
	)
	const shotPaths: string[] = []
	for (const [i, shot] of shots.entries()) {
		const shotPath = `${filePrefix}-shot-${i}.mp4`
		const shotEncode = toShotEncode({ shot, shotPictures, shotIndex: i, lowerThirdPath, shotPath })
		await encodeVideoShot(shotEncode, signal)
		shotPaths.push(shotPath)
	}

	// delete the stills and the lower third once the segment's shots are encoded
	const stillPaths = segmentStills.map((segmentStill) => segmentStill.stillPath)
	await Promise.all([...stillPaths, lowerThirdPath].map((filePath) => Bun.file(filePath).delete()))
	return shotPaths
}

// the film's podcast episode, the start of the segment's file names, its images, and how many stills its shots can show
type WriteSegmentStillsOptions = {
	podcastEpisodeId: string
	filePrefix: string
	images: VideoSegmentImage[]
	stillCount: number
	signal?: AbortSignal
}

// write a segment's stills to files, in its images' order, until its shots have enough. an image whose still cannot be
// loaded is reported and left out, and a segment left with none shows the podcast card
async function writeSegmentStills({
	podcastEpisodeId,
	filePrefix,
	images,
	stillCount,
	signal,
}: WriteSegmentStillsOptions): Promise<SegmentStill[]> {
	const segmentStills: SegmentStill[] = []
	for (const image of images) {
		signal?.throwIfAborted()
		if (segmentStills.length >= stillCount) {
			break
		}

		// load the image's still, and leave the image out if it cannot be read
		const stillPng = await image.loadStillPng().catch((error: unknown) => {
			reportError(error, "topic-podcast-episode-video", { podcastEpisodeId, step: "chapter-still" })
			return null
		})

		// write the still that loaded under the next still number
		if (stillPng) {
			const stillPath = `${filePrefix}-still-${segmentStills.length}.png`
			await Bun.write(stillPath, stillPng)
			segmentStills.push({ stillPath, zoomLimit: image.zoomLimit })
		}
	}

	// a segment with no still that loaded shows the podcast card
	if (segmentStills.length === 0) {
		const stillPath = `${filePrefix}-still-0.png`
		await Bun.write(stillPath, await loadPodcastCardStillPng())
		segmentStills.push({ stillPath, zoomLimit: PODCAST_CARD_ZOOM_LIMIT })
	}
	return segmentStills
}

// a shot, its segment's stills, and whether the shot is its segment's last
type ToShotPictureOptions = { shot: VideoShot; segmentStills: SegmentStill[]; isLastShot: boolean }

// a shot's picture: its still, its move, its frames, and the frames it is on screen
function toShotPicture({ shot, segmentStills, isLastShot }: ToShotPictureOptions): VideoShotPicture {
	const segmentStill = segmentStills[shot.imageIndex]
	if (!segmentStill) {
		throw new Error(`a shot shows image ${shot.imageIndex}, and its segment has ${segmentStills.length} stills`)
	}
	return {
		...segmentStill,
		move: shot.move,
		frameCount: shot.frameCount,
		screenFrameCount: toShotScreenFrameCount(shot, isLastShot),
	}
}

// a shot, every picture of its segment, the shot's index, the segment's lower third png, and the file the shot writes
type ToShotEncodeOptions = {
	shot: VideoShot
	shotPictures: VideoShotPicture[]
	shotIndex: number
	lowerThirdPath: string
	shotPath: string
}

// a shot's run: its picture, the picture before it, the lower third if the shot starts while the lower third still
// shows, and whether the shot starts or ends its segment
function toShotEncode({
	shot,
	shotPictures,
	shotIndex,
	lowerThirdPath,
	shotPath,
}: ToShotEncodeOptions): VideoShotEncode {
	const shotPicture = shotPictures[shotIndex]
	if (!shotPicture) {
		throw new Error(`the segment has no shot at index ${shotIndex}`)
	}

	// the lower third is gone by the segment's eighth second, so a shot that starts later has none
	const shotStartSeconds = toSegmentSeconds(shot.startFrame)
	const hasLowerThird = shot.startFrame < LOWER_THIRD_OUT_SECONDS * VIDEO_FRAMES_PER_SECOND
	return {
		...shotPicture,
		previousShot: shotPictures[shotIndex - 1] ?? null,
		lowerThird: hasLowerThird ? { lowerThirdPath, shotStartSeconds } : null,
		isSegmentStart: shotIndex === 0,
		isSegmentEnd: shotIndex === shotPictures.length - 1,
		shotPath,
	}
}

// the parts in film order, any of them missing, and the folder that the join's list goes in
type VideoPartsInOrder = {
	workDirectory: string
	introPath: string | null
	chaptersPath: string | null
	signOffPath: string | null
}

// the parts, the podcast episode's MP3, the captions, the film to write, and the signal that stops the mux
type WriteVideoFilmOptions = VideoPartsInOrder & {
	audioPath: string
	captionsPath: string
	filmPath: string
	signal?: AbortSignal
}

/**
 * Writes the film: the parts joined by stream copy, with the audio and the captions.
 */
export async function writeVideoFilm({
	audioPath,
	captionsPath,
	filmPath,
	signal,
	...videoParts
}: WriteVideoFilmOptions): Promise<void> {
	const listPath = await writePartsList(videoParts)
	await muxFilm({ listPath, audioPath, captionsPath, filmPath }, signal)
}

// the parts, the film that plays now, the rebuilt film to write, and the signal that stops the remux
type RewriteVideoFilmOptions = VideoPartsInOrder & { currentFilmPath: string; filmPath: string; signal?: AbortSignal }

/**
 * Writes a rebuilt film: the parts joined by stream copy, with the audio and the captions of the film that plays now.
 */
export async function rewriteVideoFilm({
	currentFilmPath,
	filmPath,
	signal,
	...videoParts
}: RewriteVideoFilmOptions): Promise<void> {
	const listPath = await writePartsList(videoParts)
	await remuxFilm({ listPath, currentFilmPath, filmPath }, signal)
}

// write the concat list of the parts that exist, in film order
async function writePartsList({
	workDirectory,
	introPath,
	chaptersPath,
	signOffPath,
}: VideoPartsInOrder): Promise<string> {
	const partPaths = [introPath, chaptersPath, signOffPath].filter((partPath): partPath is string => partPath !== null)
	const listPath = join(workDirectory, "parts.txt")
	await writeConcatList(partPaths, listPath)
	return listPath
}
