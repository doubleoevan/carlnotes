import type { TopicResponse } from "@shared/contracts"
import { ListOrdered, PawPrint, Pencil, Share2, Trash2 } from "lucide-react"
import type * as React from "react"
import { ShareTopicButton } from "@/components/share/ShareTopic"
import { isTeamUpShown, TeamUpButton } from "@/components/team/TeamUpButton"
import { isFollowShown, SubscribeButton } from "@/components/topic/TopicPageHeader"
import { isManualScanShown } from "@/components/topic/TopicScanButton.tsx"
import { MENU_BUTTON_CLASS } from "@/lib/styleClasses"
import type { PageActionOption } from "@/stores/pageActionsStore"

// what the action bar's layout depends on
type TopicActionContext = {
	// undefined while the payload loads. the call-to-action skeleton stands in for it
	topic: TopicResponse | null | undefined
	isSignedIn: boolean
	isBookmarkedView: boolean
	// whether a team owns this topic and the user is on none of the teams that have it
	isJoinable: boolean
}

/**
 * Which control the topic's action bar highlights. Exactly one is the call to action, and share
 * takes the left when nothing else claims it. The bar reads as one control on each end.
 */
function toActionLayout({ topic, isSignedIn, isBookmarkedView, isJoinable }: TopicActionContext) {
	const canScan = isManualScanShown(topic)
	const isFollowCallToAction = !canScan && !isJoinable && !isSignedIn
	const isTeamUpCallToAction = !canScan && !isJoinable && isSignedIn

	// either show the call to action or a menu row, and team up is either the row or the call to action
	const isTeamUpInRow = Boolean(topic && isTeamUpShown(topic, isSignedIn) && !isTeamUpCallToAction)
	const isBookmarkScopeShown = isBookmarkedView && Boolean(topic?.isTeamMember)
	return {
		isJoinCallToAction: !canScan && isJoinable,
		isFollowCallToAction,
		isFollowInMenu: Boolean(topic && isFollowShown(topic) && !isFollowCallToAction),
		isTeamUpInRow,
		isTeamUpCallToAction,
		isShareInRow: Boolean(topic) && !isBookmarkScopeShown && !isTeamUpInRow,
	}
}

// whether the follow row goes in the page's actions menu instead of the bar
export function isFollowInMenu(context: TopicActionContext): boolean {
	return toActionLayout(context).isFollowInMenu
}

// the rows this page hands the search bar's actions menu, in the order they read
export function toTopicActionOptions({
	topic,
	isAdmin,
	isFollowInMenu,
	onShare,
	onToggleFollow,
	onRank,
	onEdit,
	onDelete,
}: {
	topic: TopicResponse
	isAdmin: boolean
	isFollowInMenu: boolean
	onShare: () => void
	onToggleFollow: () => void
	onRank: () => void
	onEdit: () => void
	onDelete: () => void
}): PageActionOption[] {
	return [
		// on a team topic Team Up holds the row, so following leads the menu instead of being a second button
		...(isFollowInMenu
			? [
					{
						label: topic.isSubscribed ? "Unfollow topic" : "Follow topic",
						Icon: PawPrint,
						isActive: topic.isSubscribed,
						onSelect: onToggleFollow,
					},
				]
			: []),
		// an admin arranges the Featured section from inside the topic itself, on a public topic alone
		...(isAdmin && topic.visibility === "public"
			? [{ label: "Featured topics", Icon: ListOrdered, onSelect: onRank }]
			: []),
		// sharing sits directly above editing
		{ label: "Share topic", Icon: Share2, onSelect: onShare },
		...(topic.canEdit
			? [
					{ label: "Edit topic", Icon: Pencil, onSelect: onEdit },
					{ label: "Delete topic", Icon: Trash2, onSelect: onDelete },
				]
			: []),
	]
}

/**
 * The static button bar above the payload, so the buttons never jump or animate in. Every control sits
 * left but the page's one call to action, which holds the right. The bar wraps when the screen is narrow.
 */
export function TopicActionBar({
	topic,
	isSignedIn,
	isBookmarkedView,
	isJoinable,
	joinButton,
	scanControl,
	onSubscriptionToggle,
}: TopicActionContext & {
	// the join and scan controls own their own sends. the bar only decides where they sit
	joinButton: React.ReactNode
	scanControl: React.ReactNode
	onSubscriptionToggle: () => Promise<void>
}) {
	const { isJoinCallToAction, isFollowCallToAction, isTeamUpInRow, isTeamUpCallToAction, isShareInRow } =
		toActionLayout({ topic, isSignedIn, isBookmarkedView, isJoinable })
	return (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div className="flex flex-wrap items-start gap-2">
				{/* share fills the left unless follow or team up already does. the actions menu has it either way */}
				{topic && isShareInRow && <ShareTopicButton topic={topic} className={MENU_BUTTON_CLASS} />}
				{topic && isTeamUpInRow && (
					<TeamUpButton
						topic={topic}
						isSignedIn={isSignedIn}
						isHighlighted={false}
						onChanged={() => window.location.reload()}
					/>
				)}
			</div>
			{/* the call to action: whoever may scan brews, an outsider joins the team that has it, a visitor follows,
			    and everyone else teams up.
			    while the page loads, a skeleton holds the slot */}
			<div className="flex items-start gap-2">
				{topic === undefined && (
					<div
						aria-hidden="true"
						className="bg-muted h-11 w-28 animate-pulse rounded-lg motion-reduce:animate-none sm:h-9"
					/>
				)}
				{/* the scan control mounts for every user to keep its poll running, and shows nothing to the rest */}
				{scanControl}
				{isJoinCallToAction && joinButton}
				{topic && isFollowCallToAction && (
					<SubscribeButton topic={topic} isSignedIn={isSignedIn} isHighlighted onToggle={onSubscriptionToggle} />
				)}
				{topic && isTeamUpCallToAction && (
					<TeamUpButton
						topic={topic}
						isSignedIn={isSignedIn}
						isHighlighted
						onChanged={() => window.location.reload()}
					/>
				)}
			</div>
		</div>
	)
}
