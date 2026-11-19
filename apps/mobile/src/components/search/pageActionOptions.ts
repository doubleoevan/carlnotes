// the action menu options that more than one screen offers, and the labels their sheets repeat

import { EDIT_PODCAST_EPISODE_LABEL, EDIT_TOPIC_VIDEO_LABEL } from "@carlnotes/core/lib/podcastEpisodeEditor"
import { Clapperboard, Mic, Pencil, Share as ShareIcon, Users } from "lucide-react-native"
import type { PageActionOption } from "@/components/search/PageActionMenu"

// the names the options and their sheets share
export const ADD_TOPIC_TO_TEAM_LABEL = "Add topic to team"
export const SHARE_TOPIC_LABEL = "Share topic"

/**
 * Returns the option that opens the team picker for the screen's Topic.
 */
export function toAddTopicToTeamOption(onSelect: () => void): PageActionOption {
	return { label: ADD_TOPIC_TO_TEAM_LABEL, icon: Users, onSelect }
}

/**
 * Returns the option that opens the share sheet for the screen's Topic.
 */
export function toShareTopicOption(onSelect: () => void): PageActionOption {
	return { label: SHARE_TOPIC_LABEL, icon: ShareIcon, onSelect }
}

// the calls that open the Edit topic, Edit film, and Edit podcast sheets, each null if the screen does not offer
// that option
type EditOptionsOptions = {
	onEditTopic: (() => void) | null
	onEditTopicVideo: (() => void) | null
	onEditPodcastEpisode: (() => void) | null
}

/**
 * Returns the editing options in the web's order, which the topic and podcast episode screens share: Edit topic,
 * Edit film, then Edit podcast.
 */
export function toEditOptions({
	onEditTopic,
	onEditTopicVideo,
	onEditPodcastEpisode,
}: EditOptionsOptions): PageActionOption[] {
	return [
		...(onEditTopic ? [{ label: "Edit topic", icon: Pencil, onSelect: onEditTopic }] : []),
		...(onEditTopicVideo ? [{ label: EDIT_TOPIC_VIDEO_LABEL, icon: Clapperboard, onSelect: onEditTopicVideo }] : []),
		...(onEditPodcastEpisode ? [{ label: EDIT_PODCAST_EPISODE_LABEL, icon: Mic, onSelect: onEditPodcastEpisode }] : []),
	]
}
