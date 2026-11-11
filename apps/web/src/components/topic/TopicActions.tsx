import type { TopicActionContext, TopicActionLayout } from "@carlnotes/core/lib/topicActions"

export { toTopicActionLayout } from "@carlnotes/core/lib/topicActions"

import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	EDIT_TOPIC_PODCAST_EPISODE_VIDEO_LABEL,
	toTopicPageEditedPodcastEpisode,
} from "@carlnotes/core/lib/podcastEpisodeEditor"
import { HOME_RANK_OPTION_LABELS, PROFILE_RANK_OPTION_LABELS } from "@carlnotes/core/lib/rankDialog"
import { Clapperboard, Home, ListOrdered, PawPrint, Pencil, Share, Trash2, Users } from "lucide-react"
import type * as React from "react"
import { ShareTopic } from "@/components/share/ShareTopic"
import { AddTopicToTeamButton } from "@/components/team/AddTopicToTeamButton"
import { PAGE_BUTTON_ROW_CLASS, PAGE_BUTTON_SKELETON_CLASS, PLAIN_PAGE_BUTTON_CLASS } from "@/lib/styleClasses"
import type { PageActionOption } from "@/stores/pageActionsStore"
import { NewTopicButton } from "./TopicEditorChoiceDialog"
import { SubscribeButton } from "./TopicPageHeader"

/**
 * Returns the options that the topic page gives the search bar's actions menu, in reading order.
 */
export function toTopicActionOptions({
	topic,
	isAdminUser,
	topicActionLayout,
	onAddTopicToTeam,
	onShareTopic,
	onToggleFollowTopic,
	onRankHomeTopic,
	onRankProfileTopic,
	onEditTopicPodcastEpisodeVideo,
	onEditTopic,
	onDeleteTopic,
}: {
	topic: TopicResponse
	isAdminUser: boolean
	topicActionLayout: TopicActionLayout
	onAddTopicToTeam: () => void
	onShareTopic: () => void
	onToggleFollowTopic: () => void
	onRankHomeTopic: () => void
	onRankProfileTopic: () => void
	onEditTopicPodcastEpisodeVideo: () => void
	onEditTopic: () => void
	onDeleteTopic: () => void
}): PageActionOption[] {
	return [
		// the follow option leads the menu if Follow shows and is not the call to action
		...(topicActionLayout.isSubscribeInMenu
			? [
					{
						label: topic.isSubscribed ? "Unfollow topic" : "Follow topic",
						Icon: PawPrint,
						isActive: topic.isSubscribed,
						onSelect: onToggleFollowTopic,
					},
				]
			: []),
		// on a public topic alone, an admin arranges the home's topics from inside the topic itself, and the topic's
		// owner arranges their own profile's featured topics
		...(topic.visibility === "public"
			? toRankOptions({ topic, isAdminUser, onRankHomeTopic, onRankProfileTopic })
			: []),
		// the Add topic to team option opens its dialog if Join Team holds the bar's left
		...(topicActionLayout.isAddTopicToTeamInMenu ? [toAddTopicToTeamOption(onAddTopicToTeam)] : []),
		// sharing sits directly above editing, and Edit film, for a topic whose latest podcast episode has a film, leads
		// the editing options
		toShareTopicOption(onShareTopic),
		...(toTopicPageEditedPodcastEpisode(topic)
			? [toEditTopicPodcastEpisodeVideoOption(onEditTopicPodcastEpisodeVideo)]
			: []),
		...(topic.canEdit
			? [
					{ label: "Edit topic", Icon: Pencil, onSelect: onEditTopic },
					{ label: "Delete topic", Icon: Trash2, onSelect: onDeleteTopic },
				]
			: []),
	]
}

// a public topic's rank options: the home's for an admin, under the home's icon, and the profile's for its owner
function toRankOptions({
	topic,
	isAdminUser,
	onRankHomeTopic,
	onRankProfileTopic,
}: {
	topic: TopicResponse
	isAdminUser: boolean
	onRankHomeTopic: () => void
	onRankProfileTopic: () => void
}): PageActionOption[] {
	return [
		...(isAdminUser ? [{ label: HOME_RANK_OPTION_LABELS.topics, Icon: Home, onSelect: onRankHomeTopic }] : []),
		...(topic.isTopicOwner
			? [{ label: PROFILE_RANK_OPTION_LABELS.topics, Icon: ListOrdered, onSelect: onRankProfileTopic }]
			: []),
	]
}

/**
 * Returns the actions menu's Add topic to team option.
 */
export function toAddTopicToTeamOption(onSelect: () => void): PageActionOption {
	return { label: "Add topic to team", Icon: Users, onSelect }
}

/**
 * Returns the actions menu's Share topic option.
 */
export function toShareTopicOption(onSelect: () => void): PageActionOption {
	return { label: "Share topic", Icon: Share, onSelect }
}

/**
 * Returns the actions menu's Edit film option, which opens the film's image dialog.
 */
export function toEditTopicPodcastEpisodeVideoOption(onSelect: () => void): PageActionOption {
	return { label: EDIT_TOPIC_PODCAST_EPISODE_VIDEO_LABEL, Icon: Clapperboard, onSelect }
}

/**
 * The topic's static action bar, with one control on the left and the call to action on the right.
 */
export function TopicActionBar({
	topic,
	isSignedIn,
	topicActionLayout,
	renderJoinButton,
	scanControl,
	onNewTopic,
	onSubscriptionToggle,
}: Pick<TopicActionContext, "topic" | "isSignedIn"> & {
	topicActionLayout: TopicActionLayout
	// the join and scan controls own their own sends. the bar decides where the controls sit
	// and whether the join button is highlighted
	renderJoinButton: ({ isHighlighted }: { isHighlighted: boolean }) => React.ReactNode
	scanControl: React.ReactNode
	onNewTopic: () => void
	onSubscriptionToggle: () => Promise<void>
}) {
	const {
		isNewTopicCallToAction,
		isJoinCallToAction,
		isJoinOnLeft,
		isSubscribeCallToAction,
		isAddTopicToTeamOnLeft,
		isShareOnLeft,
	} = topicActionLayout
	return (
		<div className={PAGE_BUTTON_ROW_CLASS}>
			{/* the left holds the first of the join, add topic to team, and share buttons that applies, in the plain
			    style with its icon alone in the highlight color, or a skeleton while the page loads. the actions menu has
			    the rest */}
			<div className="flex flex-wrap items-start gap-2">
				{topic === undefined && <div aria-hidden="true" className={PAGE_BUTTON_SKELETON_CLASS} />}
				{isJoinOnLeft && renderJoinButton({ isHighlighted: false })}
				{topic && isAddTopicToTeamOnLeft && (
					<AddTopicToTeamButton
						topic={topic}
						isSignedIn={isSignedIn}
						onTopicTeamsChanged={() => window.location.reload()}
					/>
				)}
				{topic && isShareOnLeft && <ShareTopic topic={topic} className={PLAIN_PAGE_BUTTON_CLASS} isIconHighlighted />}
			</div>
			{/* the call to action, or a skeleton while the page loads */}
			<div className="flex flex-wrap items-start justify-end gap-2">
				{topic === undefined && <div aria-hidden="true" className={PAGE_BUTTON_SKELETON_CLASS} />}
				{/* the scan control mounts for every user to keep its poll running, and shows nothing to the rest */}
				{scanControl}
				{isNewTopicCallToAction && <NewTopicButton onNewTopic={onNewTopic} />}
				{isJoinCallToAction && renderJoinButton({ isHighlighted: true })}
				{topic && isSubscribeCallToAction && (
					<SubscribeButton topic={topic} isSignedIn={isSignedIn} isHighlighted onToggle={onSubscriptionToggle} />
				)}
			</div>
		</div>
	)
}
