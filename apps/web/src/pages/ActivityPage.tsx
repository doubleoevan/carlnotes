import { fetchActivity } from "@carlnotes/client/activityClient"
import { authClient } from "@carlnotes/client/authClient"
import type { ActivityResponse } from "@carlnotes/contracts/activity"
import { toSessionProfileIdentity } from "@carlnotes/contracts/profiles"
import { toSectionCountLabel } from "@carlnotes/core/lib/labels"
import { useTopicInviteBadges } from "@carlnotes/core/stores/topicInviteStore"
import { Activity } from "lucide-react"
import type * as React from "react"
import { useEffect, useState } from "react"
import { AccordionSection } from "@/components/common/AccordionSection"
import { AnchorLink } from "@/components/common/AnchorLink"
import { UpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { UserProfileLinkSkeleton } from "@/components/common/UserProfileLinkSkeleton"
import { PageSkeleton } from "@/components/layout/PageSkeleton"
import { Accordion } from "@/components/primitives/accordion"
import { EmptyListCard } from "@/components/table/TableCard"
import { TopicInvitesTable } from "@/components/table/TopicInvitesTable.tsx"
import { TopicSubscriptionsTable } from "@/components/table/TopicSubscriptionsTable"
import { NewTopicButton, useNewTopicDialog } from "@/components/topic/TopicEditorChoiceDialog"
import { usePageTitle } from "@/hooks/usePageTitle"
import { useSearchParams } from "@/hooks/useSearchParams"
import { PAGE_CLASS, PAGE_HEADER_CLASS, PAGE_TITLE_CLASS } from "@/lib/styleClasses"
import { useRegisterPageActions } from "@/stores/pageActionsStore"

// the margin over the page's sections, loaded or loading
const ACTIVITY_SECTIONS_CLASS = "mt-2"

/**
 * The Activity page: the signed-in user's topic subscriptions and the invitations they sent.
 */
export function ActivityPage() {
	usePageTitle("Activity")
	// the topic invitations waiting for the user's response, badged on the title
	const topicInviteBadges = useTopicInviteBadges()
	const { data: session } = authClient().useSession()
	const [activity, setActivity] = useState<ActivityResponse | null>(null)
	// a load the api rejected or did not respond to
	const [isLoadFailed, setIsLoadFailed] = useState(false)

	// the New Topic button's dialog
	const { openNewTopicDialog, newTopicDialog } = useNewTopicDialog()

	// the user whose activity the page shows, the userId param's user or else the signed-in user
	const searchParams = useSearchParams()
	const viewedUserId = searchParams.get("userId") ?? undefined
	const isOwnView = !viewedUserId || viewedUserId === session?.user.id

	// the search bar's menu leaves out New topic on the user's own activity, which has its own New Topic button
	useRegisterPageActions({ page: "Activity", hasNewTopicButton: isOwnView })

	// load the viewed user's activity
	const reloadActivity = (): void => {
		fetchActivity(viewedUserId)
			.then(setActivity)
			.catch(() => setIsLoadFailed(true))
	}
	useEffect(() => {
		if (!session) {
			return
		}
		// switching users clears the last one's rows, and the flag ignores a response that arrives after the switch
		let isViewCurrent = true
		setActivity(null)
		setIsLoadFailed(false)
		fetchActivity(viewedUserId)
			.then((activityResponse) => isViewCurrent && setActivity(activityResponse))
			.catch(() => isViewCurrent && setIsLoadFailed(true))
		return () => {
			isViewCurrent = false
		}
	}, [session, viewedUserId])

	if (!session) {
		return null
	}

	// the profile link's user, from the session on the user's own page or the payload on an admin's link
	const user = isOwnView ? toSessionProfileIdentity(session.user) : activity?.user
	return (
		<main className={PAGE_CLASS}>
			{/* the page title with the same icon as its header menu item, and the new topic button to the right */}
			<div className={PAGE_HEADER_CLASS}>
				<h1 className={PAGE_TITLE_CLASS}>
					<Activity className="size-6" />
					{/* the user's own title shows the topic invitations waiting for an answer */}
					<span className="relative">
						Activity
						{isOwnView && <UpdateCountBadge invites={topicInviteBadges} className="absolute -top-2 -right-3.5 z-10" />}
					</span>
				</h1>
				{isOwnView && <NewTopicButton onNewTopic={openNewTopicDialog} />}
			</div>
			{/* the viewed user's profile link, from the session on the user's own page and from the payload on an admin's
			    link, with a placeholder on the link's own line while that payload loads */}
			{user ? (
				<UserProfileLink user={user} className="mt-2 text-sm" />
			) : (
				!isLoadFailed && <UserProfileLinkSkeleton className="mt-2 text-sm" />
			)}
			{activity ? (
				<ActivitySections activity={activity} isOwnView={isOwnView} onReload={reloadActivity} />
			) : isLoadFailed ? (
				<p className="text-muted-foreground mt-6 text-sm">{"Carl couldn't find this activity. He checked twice."}</p>
			) : (
				// the loading sections keep the loaded sections' own margin
				<div className={ACTIVITY_SECTIONS_CLASS}>
					<PageSkeleton kind="activity" />
				</div>
			)}
			{/* the dialog that the New Topic button opens */}
			{newTopicDialog}
		</main>
	)
}

// the loaded page
function ActivitySections({
	activity,
	isOwnView,
	onReload,
}: {
	activity: ActivityResponse
	isOwnView: boolean
	onReload: () => void
}) {
	return (
		<div className={ACTIVITY_SECTIONS_CLASS}>
			<Accordion type="multiple" defaultValue={["subscriptions", "invites"]}>
				{/* the user's subscriptions with their active and email preferences */}
				<AccordionSection
					value="subscriptions"
					title="Topics you follow"
					countLabel={toSectionCountLabel(activity.subscriptions.length, "topic")}
				>
					{activity.subscriptions.length > 0 ? (
						<TopicSubscriptionsTable
							subscriptions={activity.subscriptions}
							onReloadPage={onReload}
							isReadOnly={!isOwnView}
						/>
					) : isOwnView ? (
						<EmptyActivitySection>
							<AnchorLink href="/" className="sentence-link">
								Follow a topic.
							</AnchorLink>
						</EmptyActivitySection>
					) : (
						<EmptyListCard>No subscriptions.</EmptyListCard>
					)}
				</AccordionSection>

				{/* the invitations the user sent. the ones that were sent to them are subscriptions that are not active yet,
				    so they sit in the subscriptions table above */}
				<AccordionSection
					value="invites"
					title="Your topic invites"
					countLabel={toSectionCountLabel(activity.invites.length, "invite")}
				>
					{activity.invites.length > 0 ? (
						<TopicInvitesTable invites={activity.invites} onReload={onReload} isReadOnly={!isOwnView} />
					) : isOwnView ? (
						<EmptyActivitySection>
							<AnchorLink href="/" className="sentence-link">
								Share a topic.
							</AnchorLink>
						</EmptyActivitySection>
					) : (
						<EmptyListCard>No invites.</EmptyListCard>
					)}
				</AccordionSection>
			</Accordion>
		</div>
	)
}

// what an activity section shows if it is empty
function EmptyActivitySection({ children }: { children: React.ReactNode }) {
	return <EmptyListCard>{children} You know the one.</EmptyListCard>
}
