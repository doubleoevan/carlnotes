import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import { isAllowed, loadUserAccess } from "../authorization"
import { withAvatarVersion } from "../avatars"
import { attachPodcastEpisodeChapterFaviconPaths } from "../favicons"
import { toTranscriptBlocks } from "../share/podcastFeed"
import { attachReactionSummaries } from "../social/findingReactions"
import { loadPageCommentThread } from "../social/pageCommentThread"
import { loadTopicAccessAndFindings } from "../topic/accessibleFindings"
import { canRateTopic } from "../topic/findingPermissions"
import { toTeamFields } from "../topic/helpers"
import { loadEditorImageRegenerationQuota } from "../topic/imageEdits"
import { toHomePodcastEpisodes } from "./podcastEpisodeHomeOrder"
import {
	type AccessiblePodcastEpisode,
	loadPodcastEpisodePageRow,
	type PodcastEpisodePageRef,
	type PodcastEpisodePageRow,
	toAccessiblePodcastEpisode,
} from "./podcastEpisodeRows"
import { loadPodcastEpisode, loadPodcastEpisodeSummaries, loadTopicVideos } from "./podcastEpisodeShapes"
import { loadRelatedPodcastEpisodeRows, loadTopicPodcastEpisodeRows } from "./relatedPodcastEpisodes"
import { toHomeTopicVideos } from "./topicVideoHomeOrder"
import { loadTopicVideoImageEdit } from "./topicVideos"

/**
 * Loads a podcast episode's own page for a user who may listen to the episode, or null.
 */
export async function loadPodcastEpisodePage(
	podcastEpisodePageRef: PodcastEpisodePageRef,
	userId: string | null,
): Promise<PodcastEpisodePageResponse | null> {
	// the published podcast episode with its topic, its scan's start, and its topic's owner, with the user's access read
	// started beside it. the access check below shares that read through the request memo
	const [podcastEpisodePageRow] = await Promise.all([
		loadPodcastEpisodePageRow(podcastEpisodePageRef),
		userId ? loadUserAccess(userId) : null,
	])

	// the podcast episode, if the user may listen to it
	const accessiblePodcastEpisode = podcastEpisodePageRow
		? await toAccessiblePodcastEpisode(podcastEpisodePageRow, userId)
		: null
	if (!podcastEpisodePageRow || !accessiblePodcastEpisode) {
		return null
	}
	return loadPodcastEpisodePageFields({ accessiblePodcastEpisode, podcastEpisodePageRow, userId })
}

// the podcast episode that the user may listen to, the page row it was read from, and the user
type LoadPodcastEpisodePageFieldsOptions = {
	accessiblePodcastEpisode: AccessiblePodcastEpisode
	podcastEpisodePageRow: PodcastEpisodePageRow
	userId: string | null
}

// everything a podcast episode's page shows beside the page row
async function loadPodcastEpisodePageFields({
	accessiblePodcastEpisode: { podcastEpisodeRow, topic, subscriberActivatedAt },
	podcastEpisodePageRow: { podcastEpisodePageFields, owner },
	userId,
}: LoadPodcastEpisodePageFieldsOptions): Promise<PodcastEpisodePageResponse> {
	// load the findings that the chapters narrate as the user may see them, whether the user may rate the findings or
	// remove or edit the podcast episode, the owning team and the holding teams that the user is on, the rows of the
	// topic's other podcast episodes and of the related ones that the user may listen to, and the comment thread
	const podcastEpisodeId = podcastEpisodeRow.id
	const [
		{ topicFindings, isAdmin },
		canRate,
		canRemovePodcastEpisode,
		canEditPodcastEpisode,
		{ teamLink, team, roomTeams },
		topicPodcastEpisodeRows,
		relatedPodcastEpisodeRows,
		commentThread,
	] = await Promise.all([
		loadTopicAccessAndFindings({
			topic,
			userId,
			isReactionReadSkipped: true,
			chapterPodcastEpisodeId: podcastEpisodeId,
		}),
		canRateTopic(userId, topic),
		isAllowed(userId, "podcastEpisode:remove", topic),
		isAllowed(userId, "topic:edit", topic),
		toTeamFields(topic.id, topic.teamId, userId),
		loadTopicPodcastEpisodeRows({ podcastEpisodeId, topic, subscriberActivatedAt }),
		loadRelatedPodcastEpisodeRows({ podcastEpisodeId, topic, userId }),
		loadPageCommentThread({ userId, topic, target: { kind: "podcastEpisode", id: podcastEpisodeId } }),
	])

	// the podcast episode with its chapters, and the listed podcast episodes with one chapter count, all with their
	// films from one read
	const listedPodcastEpisodeRows = [...topicPodcastEpisodeRows, ...relatedPodcastEpisodeRows]
	const topicVideos = loadTopicVideos([
		podcastEpisodeId,
		...listedPodcastEpisodeRows.map((listedRow) => listedRow.podcastEpisodeRow.id),
	])
	const [podcastEpisode, listedPodcastEpisodes] = await Promise.all([
		loadPodcastEpisode({ podcastEpisodeRow, topic, userId, topicVideos }),
		loadPodcastEpisodeSummaries(listedPodcastEpisodeRows, topicVideos),
	])

	// read the chapters' findings' reactions and the page's own, the editor's regenerations this month and the film's
	// image fields, and the admin's home lists, and fill the chapters' favicons, all together
	const [
		{ pageReactions: reactions },
		imageRegenerationQuota,
		topicVideoImageEdit,
		homePodcastEpisodes,
		homeTopicPodcastEpisodeVideos,
	] = await Promise.all([
		attachReactionSummaries({
			topicFindings,
			userId,
			pageSocialTarget: { kind: "podcastEpisode", id: podcastEpisodeId },
		}),
		canEditPodcastEpisode && userId ? loadEditorImageRegenerationQuota(userId) : null,
		loadTopicVideoImageEdit({ podcastEpisodeId, canEditPodcastEpisode }),
		toHomePodcastEpisodes(podcastEpisodePageFields.homeOrder, isAdmin),
		toHomeTopicVideos(podcastEpisodeId, isAdmin),
		attachPodcastEpisodeChapterFaviconPaths(podcastEpisode.chapters),
	])
	const { id, name, prompt, visibility } = topic
	const { userId: ownerUserId, username, avatarSource, avatarKey } = owner
	return {
		podcastEpisode,
		topic: {
			id,
			name,
			prompt,
			visibility,
			owner: withAvatarVersion({ userId: ownerUserId, username, avatarSource, avatarKey }),
			teamLink,
			team,
			roomTeams,
			isTopicOwner: topic.ownerId === userId,
		},
		topicFindings,
		canRate,
		listenerCount: podcastEpisodeRow.listenerCount,
		canRemovePodcastEpisode,
		canEditPodcastEpisode,
		podcastEpisodeImageOrigin: canEditPodcastEpisode ? podcastEpisodePageFields.imageOrigin : null,
		podcastEpisodeImagePrompt: canEditPodcastEpisode ? podcastEpisodePageFields.imagePrompt : null,
		imageRegenerationQuota,
		...topicVideoImageEdit,
		...homePodcastEpisodes,
		...homeTopicPodcastEpisodeVideos,
		transcript: podcastEpisodePageFields.script ? toTranscriptBlocks(podcastEpisodePageFields.script) : [],
		// the topic's other podcast episodes, then the related ones
		topicPodcastEpisodes: listedPodcastEpisodes.slice(0, topicPodcastEpisodeRows.length),
		relatedPodcastEpisodes: listedPodcastEpisodes.slice(topicPodcastEpisodeRows.length),
		reactions,
		commentThread,
	}
}
