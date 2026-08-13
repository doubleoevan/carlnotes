import type { ActivityResponse } from "@shared/contracts"
import type * as React from "react"
import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"
import { InvitesTable } from "@/components/table/InvitesTable"
import { SubscriptionsTable } from "@/components/table/SubscriptionsTable"
import { TopicsTable } from "@/components/table/TopicsTable"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { fetchActivity } from "@/lib/activityClient"
import { authClient } from "@/lib/authClient"

/**
 * The Activity page: the signed-in user's topics with month-to-date scan spend, their subscriptions, and the invitations they sent.
 */
export function ActivityPage() {
	const navigate = useNavigate()
	const { data: session } = authClient.useSession()
	const [activity, setActivity] = useState<ActivityResponse | null>(null)
	const [isNewTopicOpen, setIsNewTopicOpen] = useState(false)
	// a load the api refused or could not answer
	const [isLoadFailed, setIsLoadFailed] = useState(false)

	// an admin may open another user's activity. everyone else sees only their own.
	// another user's activity page renders read-only.
	const [searchParams] = useSearchParams()
	const viewedUserId = searchParams.get("userId") ?? undefined
	const isOwnView = !viewedUserId || viewedUserId === session?.user.id

	// load the target user's activity
	const reloadActivity = (): void => {
		fetchActivity(viewedUserId)
			.then(setActivity)
			.catch(() => setIsLoadFailed(true))
	}
	useEffect(() => {
		if (!session) {
			return
		}
		// switching users clears the last one's rows, and the flag drops a reply that lands after the switch
		let isViewCurrent = true
		setActivity(null)
		setIsLoadFailed(false)
		fetchActivity(viewedUserId)
			.then((loaded) => isViewCurrent && setActivity(loaded))
			.catch(() => isViewCurrent && setIsLoadFailed(true))
		return () => {
			isViewCurrent = false
		}
	}, [session, viewedUserId])

	// close the add topic modal and forward to the topic page
	const handleTopicCreated = async (topicId: string): Promise<void> => {
		setIsNewTopicOpen(false)
		navigate(`/topics/${topicId}`)
	}

	if (!session) {
		return <main className="mx-auto max-w-4xl px-safe py-10">Please log in to see your activity.</main>
	}

	return (
		<main className="mx-auto max-w-4xl px-safe py-10">
			<h1 className="font-display text-2xl">Activity</h1>
			{/* the target user's profile link */}
			{activity && <UserProfileLink user={activity.user} className="mt-2 text-sm" />}
			{activity ? (
				<ActivitySections
					activity={activity}
					isOwnView={isOwnView}
					onReload={reloadActivity}
					onNewTopic={() => setIsNewTopicOpen(true)}
				/>
			) : isLoadFailed ? (
				<p className="text-muted-foreground mt-6 text-sm">{"Carl couldn't find this activity. He checked twice."}</p>
			) : (
				<CoffeeLoading />
			)}
			{isNewTopicOpen && <EditTopicModal onClose={() => setIsNewTopicOpen(false)} onTopicSaved={handleTopicCreated} />}
		</main>
	)
}

// the add topic call-to-action link
const ADD_TOPIC_CLASS = "text-link hover:underline"

// the loaded page: the topics, subscriptions, and invites sections, each in an accordion that starts open.
// an admin reading somebody else's activity page does not get the call-to-action links
function ActivitySections({
	activity,
	isOwnView,
	onReload,
	onNewTopic,
}: {
	activity: ActivityResponse
	isOwnView: boolean
	onReload: () => void
	onNewTopic: () => void
}) {
	// the empty-state's call-to-action links do not show up for an admin viewing another user's activity
	const emptyLine = (line: string) => <p className="text-muted-foreground pb-4 pl-4 text-sm">{line}</p>
	return (
		<div className="mt-6">
			<Accordion type="multiple" defaultValue={["topics", "subscriptions", "invites"]}>
				{/* the user's topics with their monthly spend. an owner with none starts one from here */}
				<AccordionItem value="topics">
					<AccordionTrigger className="font-semibold">Your topics</AccordionTrigger>
					<AccordionContent>
						{activity.topics.length > 0 ? (
							<TopicsTable topics={activity.topics} onReloadPage={onReload} isEmailEditable={isOwnView} />
						) : isOwnView ? (
							<EmptyActivitySection>
								<button type="button" onClick={onNewTopic} className={ADD_TOPIC_CLASS}>
									Give Carl a topic.
								</button>
							</EmptyActivitySection>
						) : (
							emptyLine("No topics.")
						)}
					</AccordionContent>
				</AccordionItem>

				{/* the user's subscriptions with their active and email preferences */}
				<AccordionItem value="subscriptions">
					<AccordionTrigger className="font-semibold">Your subscriptions</AccordionTrigger>
					<AccordionContent>
						{activity.subscriptions.length > 0 ? (
							<SubscriptionsTable
								subscriptions={activity.subscriptions}
								onReloadPage={onReload}
								isReadOnly={!isOwnView}
							/>
						) : isOwnView ? (
							<EmptyActivitySection>
								<AnchorLink href="/" className={ADD_TOPIC_CLASS}>
									Follow a topic.
								</AnchorLink>
							</EmptyActivitySection>
						) : (
							emptyLine("No subscriptions.")
						)}
					</AccordionContent>
				</AccordionItem>

				{/* the user's invitations with their status */}
				<AccordionItem value="invites">
					<AccordionTrigger className="font-semibold">Your invitations</AccordionTrigger>
					<AccordionContent>
						{activity.invites.length > 0 ? (
							<InvitesTable invites={activity.invites} onReload={onReload} isReadOnly={!isOwnView} />
						) : isOwnView ? (
							<EmptyActivitySection>
								<AnchorLink href="/" className={ADD_TOPIC_CLASS}>
									Share a topic.
								</AnchorLink>
							</EmptyActivitySection>
						) : (
							emptyLine("No invitations.")
						)}
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</div>
	)

	// what an activity section shows when it is empty
	function EmptyActivitySection({ children }: { children: React.ReactNode }) {
		return <p className="text-muted-foreground pb-4 pl-4 text-sm">{children} You know the one.</p>
	}
}
