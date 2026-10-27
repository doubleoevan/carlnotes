import type { TopicActionContext, TopicActionLayout } from "@carlnotes/core/lib/topicActions"

export { toTopicActionLayout } from "@carlnotes/core/lib/topicActions"

import type { TopicResponse } from "@carlnotes/contracts/topics"
import { cn } from "@carlnotes/nightshift/classNames"
import { ListOrdered, PawPrint, Pencil, Share2, Trash2, Users } from "lucide-react"
import type * as React from "react"
import { ShareTopicButton } from "@/components/share/ShareTopic"
import { AddTopicToTeamButton } from "@/components/team/AddTopicToTeamButton"
import { MENU_BUTTON_CLASS, MENU_BUTTON_HIGHLIGHT_CLASS } from "@/lib/styleClasses"
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
	onRankFeaturedTopic,
	onEditTopic,
	onDeleteTopic,
}: {
	topic: TopicResponse
	isAdminUser: boolean
	topicActionLayout: TopicActionLayout
	onAddTopicToTeam: () => void
	onShareTopic: () => void
	onToggleFollowTopic: () => void
	onRankFeaturedTopic: () => void
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
		// an admin arranges the Featured section from inside the topic itself, on a public topic alone
		...(isAdminUser && topic.visibility === "public"
			? [{ label: "Featured topics", Icon: ListOrdered, onSelect: onRankFeaturedTopic }]
			: []),
		// the Add topic to team option opens its dialog if Join Team holds the bar's left
		...(topicActionLayout.isAddTopicToTeamInMenu ? [toAddTopicToTeamOption(onAddTopicToTeam)] : []),
		// sharing sits directly above editing
		toShareTopicOption(onShareTopic),
		...(topic.canEdit
			? [
					{ label: "Edit topic", Icon: Pencil, onSelect: onEditTopic },
					{ label: "Delete topic", Icon: Trash2, onSelect: onDeleteTopic },
				]
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
	return { label: "Share topic", Icon: Share2, onSelect }
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
		<div className="flex flex-wrap items-start justify-between gap-3">
			{/* the left holds the first of the join, add topic to team, and share buttons that applies.
			    the actions menu has the rest */}
			<div className="flex flex-wrap items-start gap-2">
				{isJoinOnLeft && renderJoinButton({ isHighlighted: false })}
				{topic && isAddTopicToTeamOnLeft && (
					<AddTopicToTeamButton
						topic={topic}
						isSignedIn={isSignedIn}
						onTopicTeamsChanged={() => window.location.reload()}
					/>
				)}
				{topic && isShareOnLeft && <ShareTopicButton topic={topic} className={MENU_BUTTON_CLASS} />}
			</div>
			{/* the call to action, or a skeleton while the page loads */}
			<div className="flex items-start gap-2">
				{topic === undefined && (
					<div aria-hidden="true" className="bg-muted h-11 w-28 animate-pulse rounded-lg sm:h-9" />
				)}
				{/* the scan control mounts for every user to keep its poll running, and shows nothing to the rest */}
				{scanControl}
				{isNewTopicCallToAction && (
					<NewTopicButton className={cn(MENU_BUTTON_CLASS, MENU_BUTTON_HIGHLIGHT_CLASS)} onNewTopic={onNewTopic} />
				)}
				{isJoinCallToAction && renderJoinButton({ isHighlighted: true })}
				{topic && isSubscribeCallToAction && (
					<SubscribeButton topic={topic} isSignedIn={isSignedIn} isHighlighted onToggle={onSubscriptionToggle} />
				)}
			</div>
		</div>
	)
}
