import type { TopicResponse } from "@shared/contracts"
import { ListOrdered, PawPrint, Pencil, Share2, Trash2 } from "lucide-react"
import type * as React from "react"
import { ShareTopicButton } from "@/components/share/ShareTopic"
import { isTeamUpShown, TeamUpButton } from "@/components/team/TeamUpButton"
import { isFollowShown, SubscribeButton } from "@/components/topic/TopicPageHeader"
import { TopicScanButton } from "@/components/topic/TopicScanButton"
import { MENU_BUTTON_CLASS } from "@/lib/styleClasses"
import type { PageActionOption } from "@/stores/pageActionsStore"

// what actions a topic offers: the rows its page hands the search bar's menu

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
 * Which control the topic's action bar highlights. Exactly one is the call to action, and share
 * takes the left when nothing else claims it, so the bar reads as one control on each end.
 */
export function toTopicActionBar({
	topic,
	isSignedIn,
	isManualScanShown,
	isBookmarkedView,
	isJoinable,
}: {
	topic: TopicResponse | null | undefined
	isSignedIn: boolean
	isManualScanShown: boolean
	isBookmarkedView: boolean
	// whether a team owns this topic and the user is on none of the teams that have it
	isJoinable: boolean
}): {
	isJoinCallToAction: boolean
	isFollowCallToAction: boolean
	isFollowInMenu: boolean
	isTeamUpInRow: boolean
	isTeamUpCallToAction: boolean
	isShareInRow: boolean
} {
	const isJoinCallToAction = !isManualScanShown && isJoinable
	const isFollowCallToAction = !isManualScanShown && !isJoinable && !isSignedIn
	const isTeamUpCallToAction = !isManualScanShown && !isJoinable && isSignedIn
	const isBookmarkScopeShown = isBookmarkedView && Boolean(topic?.isTeamMember)

	// following is either the call to action or a menu row
	const isFollowInMenu = Boolean(topic && isFollowShown(topic) && !isFollowCallToAction)
	const isTeamUpInRow = Boolean(topic && isTeamUpShown(topic, isSignedIn) && !isTeamUpCallToAction)
	return {
		isJoinCallToAction,
		isFollowCallToAction,
		isFollowInMenu,
		isTeamUpInRow,
		isTeamUpCallToAction,
		isShareInRow: Boolean(topic) && !isBookmarkScopeShown && !isTeamUpInRow,
	}
}

/**
 * The static button bar above the payload, so the buttons never jump or animate in. Every control sits
 * left but the page's one call to action, which holds the right. The bar wraps when the screen is narrow.
 */
export function TopicActionBar({
	topic,
	isSignedIn,
	isShareInRow,
	isJoinCallToAction,
	joinButton,
	isFollowCallToAction,
	isTeamUpInRow,
	isTeamUpCallToAction,
	isManualScanShown,
	isRunning,
	isCancellable,
	isCancelling,
	onSubscriptionToggle,
	onManualScan,
	onCancelScan,
}: {
	// undefined while the payload loads, which is what the call-to-action skeleton stands in for
	topic: TopicResponse | null | undefined
	isSignedIn: boolean
	isShareInRow: boolean
	// the topic's owning team is the call to action where the user could join it
	isJoinCallToAction: boolean
	joinButton: React.ReactNode
	isFollowCallToAction: boolean
	isTeamUpInRow: boolean
	isTeamUpCallToAction: boolean
	isManualScanShown: boolean
	isRunning: boolean
	// only a scan that has a row to cancel can be cancelled, so the optimistic click gap has no icon
	isCancellable: boolean
	isCancelling: boolean
	onSubscriptionToggle: () => Promise<void>
	onManualScan: () => Promise<void>
	onCancelScan: () => Promise<void>
}) {
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
				{topic && isManualScanShown && (
					<TopicScanButton
						remainingScans={topic.manualScansRemaining}
						scanLimit={topic.manualScanLimit}
						isSpendExhausted={topic.isSpendExhausted}
						isRunning={isRunning}
						isCancelling={isCancelling}
						onManualScan={onManualScan}
						onCancelScan={isCancellable ? onCancelScan : undefined}
					/>
				)}
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
