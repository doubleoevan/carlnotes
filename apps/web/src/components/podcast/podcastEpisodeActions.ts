// the options a podcast episode page gives the search bar's actions menu
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import {
	EDIT_PODCAST_EPISODE_LABEL,
	isTopicPodcastEpisodeVideoEditShown,
} from "@carlnotes/core/lib/podcastEpisodeEditor"
import {
	isPodcastEpisodeHomeOrderShown,
	isPodcastEpisodeProfileOrderShown,
	isTopicPodcastEpisodeVideoHomeOrderShown,
	isTopicPodcastEpisodeVideoProfileOrderShown,
} from "@carlnotes/core/lib/podcastEpisodeHomeOrder"
import { toPodcastEpisodeReportSubject } from "@carlnotes/core/lib/podcastEpisodeSocial"
import { HOME_RANK_OPTION_LABELS, PROFILE_RANK_OPTION_LABELS } from "@carlnotes/core/lib/rankDialog"
import { Home, ListOrdered, Pencil, Trash2 } from "lucide-react"
import type { PodcastEpisodeDialog } from "@/components/podcast/PodcastEpisodeDialogs"
import { isAddTopicToTeamShown } from "@/components/team/AddTopicToTeamButton"
import {
	toAddTopicToTeamOption,
	toEditTopicPodcastEpisodeVideoOption,
	toShareTopicOption,
} from "@/components/topic/TopicActions"
import { type PageActionOption, useRegisterPageActions } from "@/stores/pageActionsStore"

// the loaded page, whether the user is signed in, and the call that opens one of the menu's dialogs
type UseRegisterPodcastEpisodePageActionsOptions = {
	podcastEpisodePage: PodcastEpisodePageResponse | null | undefined
	isSignedIn: boolean
	onOpenDialog: (podcastEpisodeDialog: PodcastEpisodeDialog) => void
}

/**
 * Registers the actions menu of a podcast episode's topic, with Edit film above Edit podcast, the home and profile
 * pins, and Remove episode last.
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
						...(podcastEpisodePage && isTopicPodcastEpisodeVideoEditShown(podcastEpisodePage)
							? [toEditTopicPodcastEpisodeVideoOption(() => onOpenDialog("edit-film"))]
							: []),
						...(podcastEpisodePage?.canEditPodcastEpisode
							? [{ label: EDIT_PODCAST_EPISODE_LABEL, Icon: Pencil, onSelect: () => onOpenDialog("edit") }]
							: []),
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
		...(isTopicPodcastEpisodeVideoHomeOrderShown(podcastEpisodePage)
			? [{ label: HOME_RANK_OPTION_LABELS.films, Icon: Home, onSelect: () => onOpenDialog("rank-films") }]
			: []),
		...(isTopicPodcastEpisodeVideoProfileOrderShown(podcastEpisodePage)
			? [toProfileRankOption("films", () => onOpenDialog("rank-profile-films"))]
			: []),
		...(isPodcastEpisodeProfileOrderShown(podcastEpisodePage)
			? [toProfileRankOption("podcasts", () => onOpenDialog("rank-profile"))]
			: []),
	]
}

// the option that opens the owner's profile pins for the films or the podcast episodes
function toProfileRankOption(rankedNoun: "films" | "podcasts", onSelect: () => void): PageActionOption {
	return { label: PROFILE_RANK_OPTION_LABELS[rankedNoun], Icon: ListOrdered, onSelect }
}
