import type { TopicResponse } from "@shared/contracts"
import { ListOrdered, PawPrint, Pencil, Share2, Trash2, Users } from "lucide-react"
import type * as React from "react"
import { ShareTopicButton } from "@/components/share/ShareTopic"
import { AddTopicToTeamButton, isAddTopicToTeamShown } from "@/components/team/AddTopicToTeamButton"
import { NewTopicButton } from "@/components/topic/TopicEditorChoiceDialog"
import { isFollowShown, SubscribeButton } from "@/components/topic/TopicPageHeader"
import { isManualScanShown } from "@/components/topic/TopicScanButton.tsx"
import { MENU_BUTTON_CLASS, MENU_BUTTON_HIGHLIGHT_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import type { PageActionOption } from "@/stores/pageActionsStore"

// what the action bar's layout depends on
type TopicActionContext = {
	// undefined while the payload loads. the call-to-action skeleton shows in its place
	topic: TopicResponse | null | undefined
	isSignedIn: boolean
	isBookmarkedView: boolean
	// whether a team owns this topic and the user is on none of the teams that have it
	isJoinable: boolean
}

// where each control sits. the call to action holds the right, one control the left, and the actions menu the rest
type TopicActionLayout = {
	isNewTopicCallToAction: boolean
	isJoinCallToAction: boolean
	isJoinOnLeft: boolean
	isFollowCallToAction: boolean
	isFollowInMenu: boolean
	isAddTopicToTeamOnLeft: boolean
	isAddTopicToTeamInMenu: boolean
	isShareOnLeft: boolean
}

/**
 * Returns where the topic's action bar puts each control.
 */
export function toTopicActionLayout({
	topic,
	isSignedIn,
	isBookmarkedView,
	isJoinable,
}: TopicActionContext): TopicActionLayout {
	// whoever may scan gets the scan button. any other signed-in user gets New Topic, and a visitor joins or follows
	const canScan = isManualScanShown(topic)
	const isNewTopicCallToAction = Boolean(topic) && isSignedIn && !canScan
	const isFollowCallToAction = !canScan && !isSignedIn && !isJoinable

	// a signed-in user who may join gets Join Team on the left. adding the topic to a team then moves into the menu
	const isJoinOnLeft = isNewTopicCallToAction && isJoinable
	const isAddTopicToTeamOffered = Boolean(topic && isAddTopicToTeamShown(topic, isSignedIn))
	const isAddTopicToTeamOnLeft = isAddTopicToTeamOffered && !isJoinOnLeft
	const isBookmarkScopeShown = isBookmarkedView && Boolean(topic?.isTeamMember)
	return {
		isNewTopicCallToAction,
		isJoinCallToAction: !canScan && !isSignedIn && isJoinable,
		isJoinOnLeft,
		isFollowCallToAction,
		isFollowInMenu: Boolean(topic && isFollowShown(topic) && !isFollowCallToAction),
		isAddTopicToTeamOnLeft,
		isAddTopicToTeamInMenu: isAddTopicToTeamOffered && isJoinOnLeft,
		isShareOnLeft: Boolean(topic) && !isBookmarkScopeShown && !isAddTopicToTeamOnLeft && !isJoinOnLeft,
	}
}

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
		...(topicActionLayout.isFollowInMenu
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
		isFollowCallToAction,
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
				{topic && isFollowCallToAction && (
					<SubscribeButton topic={topic} isSignedIn={isSignedIn} isHighlighted onToggle={onSubscriptionToggle} />
				)}
			</div>
		</div>
	)
}
