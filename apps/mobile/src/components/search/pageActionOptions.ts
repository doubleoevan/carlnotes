// the action menu options that more than one screen offers, and the labels their sheets repeat

import { EDIT_TOPIC_PODCAST_EPISODE_VIDEO_LABEL } from "@carlnotes/core/lib/podcastEpisodeEditor"
import { Clapperboard, Share as ShareIcon, Users } from "lucide-react-native"
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

/**
 * Returns the Edit film option, which opens the image sheet of the film the screen shows.
 */
export function toEditTopicPodcastEpisodeVideoOption(onSelect: () => void): PageActionOption {
	return { label: EDIT_TOPIC_PODCAST_EPISODE_VIDEO_LABEL, icon: Clapperboard, onSelect }
}
