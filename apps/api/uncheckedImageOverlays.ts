// the unchecked image overlays: a subject's own page read shows a signed-in editor their unchecked upload in place of
// the published image, with the flag the image's editor reads. each unchecked url is marked as an unchecked image's
// path. every other read keeps the published image

import { toAvatarKeyVersion } from "@carlnotes/contracts/avatars"
import type { UncheckedImageSubjectKind } from "@carlnotes/contracts/enums"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import {
	type TopicImageUrls,
	toPodcastEpisodeImageUrls,
	toTopicImageUrls,
	toTopicPodcastEpisodeVideoPosterUrl,
	toTopicPostImageUrls,
	toUncheckedTopicImageUrls,
} from "@carlnotes/contracts/topicImages"
import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { toUncheckedImagePath } from "@carlnotes/contracts/uncheckedImages"
import { loadUncheckedImageForUploader, loadUncheckedImageHashesForUploader } from "@carlnotes/db/uncheckedImages"
import { isLeaderRole } from "./authorization"

/**
 * Returns a topic's page with this user's unchecked upload in place of the topic's image, if the user may edit the
 * topic and uploaded the topic's unchecked image. Returns the page as it is for anyone else.
 */
export async function overlayUncheckedTopicImage(
	topicPage: TopicResponse,
	userId: string | null,
): Promise<TopicResponse> {
	// only a signed-in editor reads an unchecked image
	if (!userId || !topicPage.canEdit) {
		return topicPage
	}

	// this user's unchecked upload, in the topic's image's place
	const uncheckedImage = await loadUncheckedImageForUploader(
		{ subjectKind: "topicImage", subjectId: topicPage.id },
		userId,
	)
	return uncheckedImage?.imageHash
		? { ...topicPage, ...toUncheckedImageFields(toTopicImageUrls(topicPage.id, uncheckedImage.imageHash)) }
		: topicPage
}

/**
 * Returns a Topic Post's page with this user's unchecked upload in place of the post's image, if the user may change
 * the post's image and uploaded the post's unchecked image. Returns the page as it is for anyone else.
 */
export async function overlayUncheckedTopicPostImage(
	topicPost: TopicPostResponse,
	userId: string | null,
): Promise<TopicPostResponse> {
	// only a signed-in user who may change the image reads an unchecked image
	if (!userId || !topicPost.canEditImage) {
		return topicPost
	}

	// this user's unchecked upload, in the post's image's place
	const uncheckedImage = await loadUncheckedImageForUploader(
		{ subjectKind: "topicPostImage", subjectId: topicPost.id },
		userId,
	)
	return uncheckedImage?.imageHash
		? { ...topicPost, ...toUncheckedImageFields(toTopicPostImageUrls(topicPost.id, uncheckedImage.imageHash)) }
		: topicPost
}

/**
 * Returns a team's page with the version of this user's unchecked avatar, if the user leads the team and uploaded
 * the team's unchecked avatar. The team's own avatar version stays the published one.
 */
export async function overlayUncheckedTeamAvatar(
	teamPage: TeamPageResponse,
	userId: string | null,
): Promise<TeamPageResponse> {
	// only a signed-in leader reads an unchecked image
	if (!userId || !isLeaderRole(teamPage.role)) {
		return teamPage
	}

	// the version of this leader's unchecked upload, beside the published one
	const uncheckedImage = await loadUncheckedImageForUploader(
		{ subjectKind: "teamAvatar", subjectId: teamPage.teamId },
		userId,
	)
	const uncheckedAvatarVersion = toAvatarKeyVersion(uncheckedImage?.avatarKey ?? null)
	return uncheckedAvatarVersion ? { ...teamPage, uncheckedAvatarVersion } : teamPage
}

/**
 * Returns a podcast episode's page with this user's unchecked uploads in place of the podcast episode's image and of
 * its film's poster, if the user may edit the podcast episode and uploaded an unchecked image for either. Returns
 * the page as it is for anyone else.
 */
export async function overlayUncheckedPodcastEpisodePageImages(
	podcastEpisodePage: PodcastEpisodePageResponse,
	userId: string | null,
): Promise<PodcastEpisodePageResponse> {
	// only a signed-in editor reads an unchecked image
	if (!userId || !podcastEpisodePage.canEditPodcastEpisode) {
		return podcastEpisodePage
	}

	// the podcast episode with the unchecked uploads, and which of its two images is unchecked
	const { podcastEpisode, isPodcastEpisodeImageUnchecked, isTopicPodcastEpisodeVideoImageUnchecked } =
		await overlayUncheckedPodcastEpisodeImages(podcastEpisodePage.podcastEpisode, userId)

	// the editor reads an unchecked image as an upload, which has no image prompt
	const uncheckedPodcastEpisodeImageFields = isPodcastEpisodeImageUnchecked
		? {
				isPodcastEpisodeImageUnchecked,
				podcastEpisodeImageOrigin: "uploaded" as const,
				podcastEpisodeImagePrompt: null,
			}
		: {}
	const uncheckedTopicPodcastEpisodeVideoImageFields = isTopicPodcastEpisodeVideoImageUnchecked
		? {
				isTopicPodcastEpisodeVideoImageUnchecked,
				topicPodcastEpisodeVideoImageOrigin: "uploaded" as const,
				topicPodcastEpisodeVideoImagePrompt: null,
			}
		: {}
	return {
		...podcastEpisodePage,
		podcastEpisode,
		...uncheckedPodcastEpisodeImageFields,
		...uncheckedTopicPodcastEpisodeVideoImageFields,
	}
}

// a podcast episode as its uploader sees it, and which of its two images is their unchecked upload
type UncheckedPodcastEpisodeImages = {
	podcastEpisode: PodcastEpisode
	isPodcastEpisodeImageUnchecked: boolean
	isTopicPodcastEpisodeVideoImageUnchecked: boolean
}

/**
 * Returns a podcast episode with this user's unchecked uploads in place of its image and of its film's poster, and
 * which of the two is unchecked. The caller checks that the user may edit the podcast episode.
 */
export async function overlayUncheckedPodcastEpisodeImages(
	podcastEpisode: PodcastEpisode,
	userId: string,
): Promise<UncheckedPodcastEpisodeImages> {
	// the hash of each of this user's unchecked uploads, null with none
	const uncheckedImageRows = await loadUncheckedImageHashesForUploader({
		subjectKinds: PODCAST_EPISODE_UNCHECKED_IMAGE_KINDS,
		subjectId: podcastEpisode.id,
		userId,
	})
	const toUncheckedImageHash = (subjectKind: UncheckedImageSubjectKind): string | null =>
		uncheckedImageRows.find((uncheckedImageRow) => uncheckedImageRow.subjectKind === subjectKind)?.imageHash ?? null
	const podcastEpisodeImageHash = toUncheckedImageHash("podcastEpisodeImage")
	const topicPodcastEpisodeVideoImageHash = toUncheckedImageHash("topicPodcastEpisodeVideoImage")

	// an unchecked film image shows on a ready film alone, as its poster, at its unchecked path
	const { video } = podcastEpisode
	const uncheckedPosterUrl =
		video && topicPodcastEpisodeVideoImageHash
			? toUncheckedImagePath(toTopicPodcastEpisodeVideoPosterUrl(podcastEpisode.id, topicPodcastEpisodeVideoImageHash))
			: null

	// the unchecked poster's url as the podcast episode's field and as its film's
	const uncheckedPosterFields =
		video && uncheckedPosterUrl
			? { videoPosterUrl: uncheckedPosterUrl, video: { ...video, posterUrl: uncheckedPosterUrl } }
			: {}

	// the podcast episode with each unchecked upload in its published image's place
	const shownImage = podcastEpisodeImageHash
		? toUncheckedTopicImageUrls(toPodcastEpisodeImageUrls(podcastEpisode.id, podcastEpisodeImageHash))
		: podcastEpisode.image
	return {
		podcastEpisode: { ...podcastEpisode, image: shownImage, ...uncheckedPosterFields },
		isPodcastEpisodeImageUnchecked: podcastEpisodeImageHash !== null,
		isTopicPodcastEpisodeVideoImageUnchecked: uncheckedPosterUrl !== null,
	}
}

// the two kinds of unchecked image under a podcast episode's id: its own image, and its film's
const PODCAST_EPISODE_UNCHECKED_IMAGE_KINDS: UncheckedImageSubjectKind[] = [
	"podcastEpisodeImage",
	"topicPodcastEpisodeVideoImage",
]

// what an editor's image block reads of an unchecked upload: its urls, as an upload with no image prompt, and the flag
type UncheckedImageFields = {
	image: TopicImageUrls
	imageOrigin: "uploaded"
	imagePrompt: null
	isImageUnchecked: true
}

// an unchecked upload's urls, each marked as an unchecked image's path, as the fields an editor's image block reads
function toUncheckedImageFields(image: TopicImageUrls): UncheckedImageFields {
	return { image: toUncheckedTopicImageUrls(image), imageOrigin: "uploaded", imagePrompt: null, isImageUnchecked: true }
}
