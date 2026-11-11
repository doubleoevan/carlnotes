// a podcast episode film's three parts on local files: the intro, the chapters, and the sign-off, and the film joined
// from them. the render and the rebuild both draw through here. a segment's still and lower third are deleted once the
// segment is encoded, and every ffmpeg run stops once the signal aborts

import { join } from "node:path"
import {
	encodeVideoSegment,
	joinVideo,
	muxFilm,
	remuxFilm,
	toSlideDirection,
	type VideoSegmentEncode,
	writeConcatList,
} from "./videoEncode"
import { type LowerThirdText, loadPodcastCardStillPng, toLowerThirdPng } from "./videoFrames"
import { HOT_TAKES_LOWER_THIRD_TEXT } from "./videoHotTakes"
import type { VideoSegment } from "./videoTimeline"

// one chapter's still png, at four times the film's size, whether the still is its Finding's link preview image, and
// its lower third
export type VideoChapterFrame = { stillPng: Uint8Array; isLinkPreviewImage: boolean; lowerThirdText: LowerThirdText }

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
	const introPath = await renderVideoImagePart({ ...imagePart, kind: "intro", lowerThirdText: introText })
	const signOffPath = await renderVideoImagePart({ ...imagePart, kind: "sign-off", lowerThirdText: signOffText })
	await Bun.file(stillPath).delete()
	return { introPath, signOffPath }
}

// the folder that the render works in, the timeline, the still's file, the part with its lower third, and the signal
// that stops the encode
type RenderVideoImagePartOptions = {
	workDirectory: string
	segments: VideoSegment[]
	stillPath: string
	kind: "intro" | "sign-off"
	lowerThirdText: LowerThirdText
	signal?: AbortSignal
}

// render one part that shows the film's image: one segment with its lower third held throughout. a part the
// timeline has no frames for returns null
async function renderVideoImagePart({
	workDirectory,
	segments,
	stillPath,
	kind,
	lowerThirdText,
	signal,
}: RenderVideoImagePartOptions): Promise<string | null> {
	// find the part's segment
	const segment = segments.find((timelineSegment) => timelineSegment.kind === kind)
	if (!segment) {
		return null
	}

	// draw the lower third, then encode the segment
	const lowerThirdPath = join(workDirectory, `${kind}-lower-third.png`)
	await Bun.write(lowerThirdPath, await toLowerThirdPng(lowerThirdText))
	const segmentPath = join(workDirectory, `${kind}.mp4`)
	const segmentEncode: VideoSegmentEncode = {
		stillPath,
		lowerThirdPath,
		frameCount: segment.frameCount,
		segmentKind: kind,
		slideDirection: null,
		segmentPath,
	}
	await encodeVideoSegment(segmentEncode, signal)

	// delete the lower third once the segment is encoded
	await Bun.file(lowerThirdPath).delete()
	return segmentPath
}

// the film's podcast episode, the folder that the render works in, the film's timeline, the load of a chapter's frame
// by its position, and the signal that stops the encodes and the join
type RenderVideoChaptersPartOptions = {
	podcastEpisodeId: string
	workDirectory: string
	segments: VideoSegment[]
	loadChapterFrame: (position: number) => Promise<VideoChapterFrame>
	signal?: AbortSignal
}

/**
 * Renders every chapter's segment and its hot takes' segment, and joins them into the chapters part by stream copy.
 * Each segment's still and lower third are deleted once the segment is encoded, and each segment's file once the part
 * is joined. Returns the part's file, or null if the timeline has no chapters.
 */
export async function renderVideoChaptersPart({
	podcastEpisodeId,
	workDirectory,
	segments,
	loadChapterFrame,
	signal,
}: RenderVideoChaptersPartOptions): Promise<string | null> {
	// encode the chapters one at a time, so the render holds one chapter's still in memory
	const segmentPaths: string[] = []
	for (const segment of segments) {
		if (segment.kind !== "chapter" && segment.kind !== "hot-takes") {
			continue
		}

		// write the chapter's frame, or its hot takes' frame, and encode the segment
		const segmentEncode =
			segment.kind === "chapter"
				? await writeChapterFrame({
						podcastEpisodeId,
						workDirectory,
						segment,
						chapterFrame: await loadChapterFrame(segment.position),
					})
				: await writeHotTakesFrame(workDirectory, segment)
		await encodeVideoSegment(segmentEncode, signal)
		segmentPaths.push(segmentEncode.segmentPath)

		// delete the still and the lower third once the segment is encoded
		await Bun.file(segmentEncode.stillPath).delete()
		await Bun.file(segmentEncode.lowerThirdPath).delete()
	}

	// a timeline with no chapters has no chapters part
	if (segmentPaths.length === 0) {
		return null
	}

	// join the segments by stream copy
	const chaptersPath = join(workDirectory, "chapters.mp4")
	const listPath = join(workDirectory, "chapter-segments.txt")
	await writeConcatList(segmentPaths, listPath)
	await joinVideo({ listPath, outputPath: chaptersPath }, signal)

	// the segments are no longer needed once the part is joined
	await Promise.all(segmentPaths.map((segmentPath) => Bun.file(segmentPath).delete()))
	return chaptersPath
}

// the film's podcast episode, the folder that the render works in, the chapter's segment, and its frame
type WriteChapterFrameOptions = {
	podcastEpisodeId: string
	workDirectory: string
	segment: Extract<VideoSegment, { kind: "chapter" }>
	chapterFrame: VideoChapterFrame
}

// write one chapter's still and lower third to files, and return the segment's encode
async function writeChapterFrame({
	podcastEpisodeId,
	workDirectory,
	segment,
	chapterFrame,
}: WriteChapterFrameOptions): Promise<VideoSegmentEncode> {
	// write the still and draw the lower third
	const stillPath = join(workDirectory, `chapter-${segment.position}-still.png`)
	const lowerThirdPath = join(workDirectory, `chapter-${segment.position}-lower-third.png`)
	await Bun.write(stillPath, chapterFrame.stillPng)
	await Bun.write(lowerThirdPath, await toLowerThirdPng(chapterFrame.lowerThirdText))

	// the segment's encode. a chapter's lower third fades out, and a link preview image slides in from an edge
	const { position } = segment
	return {
		stillPath,
		lowerThirdPath,
		frameCount: segment.frameCount,
		segmentKind: "chapter",
		slideDirection: chapterFrame.isLinkPreviewImage ? toSlideDirection({ podcastEpisodeId, position }) : null,
		segmentPath: join(workDirectory, `chapter-${segment.position}.mp4`),
	}
}

// write the podcast card and the hot takes' lower third to files, and return the segment's encode. the segment fades
// in and out
async function writeHotTakesFrame(
	workDirectory: string,
	segment: Extract<VideoSegment, { kind: "hot-takes" }>,
): Promise<VideoSegmentEncode> {
	// write the still and draw the lower third
	const stillPath = join(workDirectory, `hot-takes-${segment.position}-still.png`)
	const lowerThirdPath = join(workDirectory, `hot-takes-${segment.position}-lower-third.png`)
	await Bun.write(stillPath, await loadPodcastCardStillPng())
	await Bun.write(lowerThirdPath, await toLowerThirdPng(HOT_TAKES_LOWER_THIRD_TEXT))
	return {
		stillPath,
		lowerThirdPath,
		frameCount: segment.frameCount,
		segmentKind: "hot-takes",
		slideDirection: null,
		segmentPath: join(workDirectory, `hot-takes-${segment.position}.mp4`),
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
