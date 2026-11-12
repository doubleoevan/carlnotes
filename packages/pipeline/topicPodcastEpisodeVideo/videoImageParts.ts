// a podcast episode film's intro and sign-off on local files: the image the film shows, its own or else its podcast
// episode's, with a cut through one image from each chapter between. the intro pushes into the film's image and
// returns to it as the first chapter starts, and the sign-off cuts through the chapters' images and pulls back from the
// film's image as it fades. the lower third shows throughout both, and every ffmpeg run stops once the signal aborts

import { join } from "node:path"
import type { ShownImageStill } from "./topicPodcastEpisodeVideoInputs"
import { type LowerThirdText, toLowerThirdPng } from "./videoFrames"
import {
	encodeSegmentShots,
	joinVideoPartShots,
	type SegmentStill,
	type VideoSegmentImage,
	writeSegmentStills,
} from "./videoParts"
import { toCaptionBreakFrames, toImagePartShots, type VideoShot } from "./videoShots"
import type { VideoSegment } from "./videoTimeline"

// the film's podcast episode, the folder that the render works in, the film's timeline, the image the film shows, each
// chapter's first image in chapter order, the intro's and the sign-off's lower thirds, when each caption starts in the
// audio, and the signal that stops the encodes
type RenderVideoImagePartsOptions = {
	podcastEpisodeId: string
	workDirectory: string
	segments: VideoSegment[]
	// what the parts show
	shownImageStill: Pick<ShownImageStill, "stillPng" | "zoomLimit">
	chapterImages: VideoSegmentImage[]
	introText: LowerThirdText
	signOffText: LowerThirdText
	// where the shots may cut
	captionStartSeconds: number[]
	signal?: AbortSignal
}

// the intro and the sign-off on disk, null for a part the timeline has no frames for
export type VideoImagePartPaths = { introPath: string | null; signOffPath: string | null }

// the intro's or the sign-off's segment
type ImagePartSegment = Extract<VideoSegment, { kind: "intro" | "sign-off" }>

/**
 * Renders the intro and the sign-off and returns their files. The film's image is their first still, and the chapters'
 * images follow it, as many as either part cuts to. The stills and the lower thirds are deleted once the parts are
 * encoded.
 */
export async function renderVideoImageParts({
	podcastEpisodeId,
	workDirectory,
	segments,
	shownImageStill,
	chapterImages,
	introText,
	signOffText,
	captionStartSeconds,
	signal,
}: RenderVideoImagePartsOptions): Promise<VideoImagePartPaths> {
	// the timeline's intro and sign-off, and each one's shots over some number of chapter images
	const introSegment = segments.find((segment): segment is ImagePartSegment => segment.kind === "intro")
	const signOffSegment = segments.find((segment): segment is ImagePartSegment => segment.kind === "sign-off")
	const toShots = (segment: ImagePartSegment, chapterImageCount: number): VideoShot[] =>
		toImagePartShots({
			part: segment.kind,
			chapterImageCount,
			frameCount: segment.frameCount,
			captionBreakFrames: toCaptionBreakFrames({
				captionStartSeconds,
				segmentStartSeconds: segment.startSeconds,
				frameCount: segment.frameCount,
			}),
			seed: `${podcastEpisodeId}:${segment.kind}`,
		})

	// the film's image is the first still, and the chapters' stills follow, as many as either part's shots show
	const filmImageStill: SegmentStill = {
		stillPath: join(workDirectory, "film-image-still.png"),
		zoomLimit: shownImageStill.zoomLimit,
	}
	await Bun.write(filmImageStill.stillPath, shownImageStill.stillPng)
	const chapterShotCounts = [introSegment, signOffSegment].map((segment) =>
		segment ? toShots(segment, chapterImages.length).filter((shot) => shot.imageIndex > 0).length : 0,
	)
	const chapterStillCount = Math.min(chapterImages.length, Math.max(...chapterShotCounts))
	const chapterStills =
		chapterStillCount > 0
			? await writeSegmentStills({
					podcastEpisodeId,
					filePrefix: join(workDirectory, "image-part-chapter"),
					images: chapterImages,
					stillCount: chapterStillCount,
					signal,
				})
			: []

	// render each part over the stills that loaded, then delete the stills
	const segmentStills = [filmImageStill, ...chapterStills]
	const renderPart = async (
		segment: ImagePartSegment | undefined,
		lowerThirdText: LowerThirdText,
	): Promise<string | null> =>
		segment
			? renderVideoImagePart({
					workDirectory,
					part: segment.kind,
					shots: toShots(segment, chapterStills.length),
					segmentStills,
					lowerThirdText,
					signal,
				})
			: null
	const introPath = await renderPart(introSegment, introText)
	const signOffPath = await renderPart(signOffSegment, signOffText)
	await Promise.all(segmentStills.map((segmentStill) => Bun.file(segmentStill.stillPath).delete()))
	return { introPath, signOffPath }
}

// the folder that the render works in, which part it is, its shots, the stills they show, its lower third, and the
// signal that stops the encodes
type RenderVideoImagePartOptions = {
	workDirectory: string
	part: ImagePartSegment["kind"]
	shots: VideoShot[]
	segmentStills: SegmentStill[]
	lowerThirdText: LowerThirdText
	signal?: AbortSignal
}

// render one part as its shots under a lower third that shows throughout, joined into the part's file
async function renderVideoImagePart({
	workDirectory,
	part,
	shots,
	segmentStills,
	lowerThirdText,
	signal,
}: RenderVideoImagePartOptions): Promise<string> {
	// draw the lower third, then encode the shots
	const lowerThirdPath = join(workDirectory, `${part}-lower-third.png`)
	await Bun.write(lowerThirdPath, await toLowerThirdPng(lowerThirdText))
	const shotPaths = await encodeSegmentShots({
		shots,
		segmentStills,
		lowerThirdPath,
		isLowerThirdShownThroughout: true,
		filePrefix: join(workDirectory, part),
		signal,
	})

	// join the shots into the part, then delete the lower third
	const partPath = join(workDirectory, `${part}.mp4`)
	await joinVideoPartShots({ shotPaths, listPath: join(workDirectory, `${part}-shots.txt`), partPath, signal })
	await Bun.file(lowerThirdPath).delete()
	return partPath
}
