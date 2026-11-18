// reuse approved frames when the old chapters match, and rebuild unverified frames from the current source pictures
import { join } from "node:path"
import { downloadPodcastEpisodeFile } from "@carlnotes/db/store"
import { renderFilmChapters } from "./renderFilmFiles"
import type { ShownImageStill } from "./topicVideoInputs"
import type { VideoCaptionCue } from "./videoCaptions"
import type { PreparedChapterImages } from "./videoChapterImages"
import { toRetainedPosterHash } from "./videoScenePlan"
import { canReusePublishedVideoChapters } from "./videoSceneStorage"
import type { VideoSegment } from "./videoTimeline"

type RebuildVideoChaptersOptions = {
	podcastEpisodeId: string
	ownerId: string
	workDirectory: string
	renderVersion: number
	chaptersKey: string
	segments: VideoSegment[]
	captionCues: VideoCaptionCue[]
	preparedChapterImages: PreparedChapterImages
	shownImageStill: ShownImageStill
	signal?: AbortSignal
}

/**
 * Returns verified chapters for the new poster and a scene plan hash when their frames were replaced.
 */
export async function rebuildVideoChapters(
	options: RebuildVideoChaptersOptions,
): Promise<{ path: string; scenePlansHash?: string }> {
	const {
		podcastEpisodeId,
		ownerId,
		workDirectory,
		renderVersion,
		chaptersKey,
		segments,
		captionCues,
		preparedChapterImages,
		shownImageStill,
		signal,
	} = options
	if (renderVersion === 4) {
		// compare the currently authorized pictures with the exact part this rebuild read
		const captionStartSeconds = captionCues.map((cue) => cue.startSeconds)
		const posterHash = toRetainedPosterHash(podcastEpisodeId, segments, captionStartSeconds, shownImageStill)
		const canReuse = await canReusePublishedVideoChapters({
			episode: podcastEpisodeId,
			chaptersKey,
			segments,
			chapterImages: preparedChapterImages.chapterImages,
			sources: preparedChapterImages.sceneSources ?? [],
			posterHash,
			signal,
		})
		if (!canReuse) {
			// reconstruct each scene from its authorized pictures and reuse only saved animation
			const { chaptersPath, scenePlansHash } = await renderFilmChapters({
				podcastEpisodeId,
				workDirectory,
				renderVersion,
				isRetry: false,
				segments,
				captionCues,
				preparedChapterImages,
				animationBilling: { ownerId, isPlatformBilled: false, isStoredAnimationOnly: true },
				posterHash,
				signal,
			})
			if (!chaptersPath || !scenePlansHash) {
				throw new Error("The replacement film has no verified chapters part")
			}
			return { path: chaptersPath, scenePlansHash }
		}
	}

	// retain the original montage or the verified animated frames
	const path = join(workDirectory, "chapters.mp4")
	await downloadPodcastEpisodeFile({ key: chaptersKey, filePath: path, signal })
	return { path }
}
