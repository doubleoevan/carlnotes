import type { TopicResponse } from "@carlnotes/contracts/topics"

// what the action bar's layout depends on
export type TopicActionContext = {
	// undefined while the payload loads. the call-to-action skeleton shows in its place
	topic: TopicResponse | null | undefined
	isSignedIn: boolean
	isBookmarkedView: boolean
	// whether a team owns this topic and the user is on none of the teams that have it
	isJoinable: boolean
}

// where each control sits. the call to action holds the right, one control the left, and the actions menu the rest
export type TopicActionLayout = {
	isNewTopicCallToAction: boolean
	isJoinCallToAction: boolean
	isJoinOnLeft: boolean
	isSubscribeCallToAction: boolean
	isSubscribeInMenu: boolean
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
	const isSubscribeCallToAction = !canScan && !isSignedIn && !isJoinable

	// a signed-in user who may join gets Join Team on the left. adding the topic to a team then moves into the menu
	const isJoinOnLeft = isNewTopicCallToAction && isJoinable
	const isAddTopicToTeamOffered = Boolean(topic && isAddTopicToTeamShown(topic, isSignedIn))
	const isAddTopicToTeamOnLeft = isAddTopicToTeamOffered && !isJoinOnLeft
	const isBookmarkScopeShown = isBookmarkedView && Boolean(topic?.isTeamMember)
	return {
		isNewTopicCallToAction,
		isJoinCallToAction: !canScan && !isSignedIn && isJoinable,
		isJoinOnLeft,
		isSubscribeCallToAction,
		isSubscribeInMenu: Boolean(topic && isSubscribeShown(topic) && !isSubscribeCallToAction),
		isAddTopicToTeamOnLeft,
		isAddTopicToTeamInMenu: isAddTopicToTeamOffered && isJoinOnLeft,
		isShareOnLeft: Boolean(topic) && !isBookmarkScopeShown && !isAddTopicToTeamOnLeft && !isJoinOnLeft,
	}
}

/**
 * Shows the manual Scan control when the account may scan this Topic.
 */
export function isManualScanShown(topic: TopicResponse | null | undefined): boolean {
	return topic?.manualScansRemaining != null
}

/**
 * Shows the subscription action for a visible Topic belonging to someone else.
 */
export function isSubscribeShown(topic: Pick<TopicResponse, "isTopicOwner" | "visibility">): boolean {
	return !topic.isTopicOwner && topic.visibility !== "private"
}

/**
 * Shows Team Up for a signed-in user who may share this Topic.
 */
export function isAddTopicToTeamShown(
	topic: Pick<TopicResponse, "isTopicOwner" | "visibility">,
	isSignedIn: boolean,
): boolean {
	return isSignedIn && !(topic.visibility === "private" && !topic.isTopicOwner)
}
