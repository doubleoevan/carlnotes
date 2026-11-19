// the options a podcast episode page gives the search bar's actions menu
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import { isTopicVideoEditShown } from "@carlnotes/core/lib/podcastEpisodeEditor"
import {
	isPodcastEpisodeHomeOrderShown,
	isPodcastEpisodeProfileOrderShown,
	isTopicVideoHomeOrderShown,
	isTopicVideoProfileOrderShown,
} from "@carlnotes/core/lib/podcastEpisodeHomeOrder"
import { toPodcastEpisodeReportSubject } from "@carlnotes/core/lib/podcastEpisodeSocial"
import { HOME_RANK_OPTION_LABELS, PROFILE_RANK_OPTION_LABELS } from "@carlnotes/core/lib/rankDialog"
import { Home, ListOrdered, Trash2 } from "lucide-react"
import type { PodcastEpisodeDialog } from "@/components/podcast/PodcastEpisodeDialogs"
import { isAddTopicToTeamShown } from "@/components/team/AddTopicToTeamButton"
import { toAddTopicToTeamOption, toEditOptions, toShareTopicOption } from "@/components/topic/TopicActions"
import { type PageActionOption, useRegisterPageActions } from "@/stores/pageActionsStore"

// the loaded page, whether the user is signed in, and the call that opens one of the menu's dialogs
type UseRegisterPodcastEpisodePageActionsOptions = {
	podcastEpisodePage: PodcastEpisodePageResponse | null | undefined
	isSignedIn: boolean
	onOpenDialog: (podcastEpisodeDialog: PodcastEpisodeDialog) => void
}

/**
 * Registers the actions menu of a podcast episode's topic, with Edit topic, Edit film, and Edit podcast in the topic
 * page's order, the home and profile featured items, and Remove episode last.
 */
export function useRegisterPodcastEpisodePageActions({
	podcastEpisodePage,
	isSignedIn,
	onOpenDialog,
}: UseRegisterPodcastEpisodePageActionsOptions): void {
	const podcastEpisodeTopic = podcastEpisodePage?.topic
	useRegisterPageActions(
		podcastEpisodeTopic
			? {
					page: "Episode",
					options: [
						...(isAddTopicToTeamShown(podcastEpisodeTopic, isSignedIn)
							? [toAddTopicToTeamOption(() => onOpenDialog("add-topic-to-team"))]
							: []),
						toShareTopicOption(() => onOpenDialog("share")),
						// the podcast episode's edit permission is its topic's, so its editor edits the topic here too
						...toEditOptions({
							onEditTopic: podcastEpisodePage.canEditPodcastEpisode ? () => onOpenDialog("edit-topic-choice") : null,
							onEditTopicVideo: isTopicVideoEditShown(podcastEpisodePage) ? () => onOpenDialog("edit-film") : null,
							onEditPodcastEpisode: podcastEpisodePage.canEditPodcastEpisode ? () => onOpenDialog("edit") : null,
						}),
						...toPodcastEpisodeRankOptions(podcastEpisodePage, onOpenDialog),
						...(podcastEpisodePage?.canRemovePodcastEpisode
							? [{ label: "Remove episode", Icon: Trash2, onSelect: () => onOpenDialog("remove") }]
							: []),
					],
					report: toPodcastEpisodeReportSubject(podcastEpisodePage.podcastEpisode),
					hasNewTopicButton: true,
				}
			: null,
	)
}

// a podcast episode's rank options on a public topic: the home's podcasts for an admin and the home's films for an
// admin on a podcast episode with a film, under the home's icon, then the profile's films, for a published podcast
// episode with a film, and the profile's podcasts for the topic's owner
function toPodcastEpisodeRankOptions(
	podcastEpisodePage: PodcastEpisodePageResponse | null | undefined,
	onOpenDialog: (podcastEpisodeDialog: PodcastEpisodeDialog) => void,
): PageActionOption[] {
	if (!podcastEpisodePage) {
		return []
	}
	return [
		...(isPodcastEpisodeHomeOrderShown(podcastEpisodePage)
			? [{ label: HOME_RANK_OPTION_LABELS.podcasts, Icon: Home, onSelect: () => onOpenDialog("rank") }]
			: []),
		...(isTopicVideoHomeOrderShown(podcastEpisodePage)
			? [{ label: HOME_RANK_OPTION_LABELS.films, Icon: Home, onSelect: () => onOpenDialog("rank-films") }]
			: []),
		...(isTopicVideoProfileOrderShown(podcastEpisodePage)
			? [toProfileRankOption("films", () => onOpenDialog("rank-profile-films"))]
			: []),
		...(isPodcastEpisodeProfileOrderShown(podcastEpisodePage)
			? [toProfileRankOption("podcasts", () => onOpenDialog("rank-profile"))]
			: []),
	]
}

// the option that opens the owner's featured profile items for the films or the podcast episodes
function toProfileRankOption(rankedNoun: "films" | "podcasts", onSelect: () => void): PageActionOption {
	return { label: PROFILE_RANK_OPTION_LABELS[rankedNoun], Icon: ListOrdered, onSelect }
}
