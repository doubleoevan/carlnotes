import type { ActivityResponse } from "@shared/contracts"
import { Activity, Plus } from "lucide-react"
import type * as React from "react"
import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { fetchActivity } from "@/clients/activityClient"
import { authClient } from "@/clients/authClient"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"
import { Button } from "@/components/primitives/button"
import { TopicInvitesTable } from "@/components/table/TopicInvitesTable.tsx"
import { TopicSubscriptionsTable } from "@/components/table/TopicSubscriptionsTable"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { usePageTitle } from "@/hooks/usePageTitle"
import { PAGE_CLASS } from "@/lib/styleClasses"

/**
 * The Activity page: the signed-in user's topic subscriptions and the invitations they sent.
 */
export function ActivityPage() {
	usePageTitle("Activity")
	const navigate = useNavigate()
	const { data: session } = authClient.useSession()
	const [activity, setActivity] = useState<ActivityResponse | null>(null)
	// a load the api rejected or could not answer
	const [isLoadFailed, setIsLoadFailed] = useState(false)
	const [isNewTopicOpen, setIsNewTopicOpen] = useState(false)

	// an admin may open another user's activity
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
		// switching users clears the last one's rows, and the flag ignores a response that arrives after the switch
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

	// a saved topic closes the modal and opens the topic it created
	const handleTopicCreated = async (topicId: string): Promise<void> => {
		setIsNewTopicOpen(false)
		navigate(`/topics/${topicId}`)
	}

	if (!session) {
		return <main className={PAGE_CLASS}>Please log in to see your activity.</main>
	}

	return (
		<main className={PAGE_CLASS}>
			{/* the page title with the same icon as its header menu item, and the new topic button to the right */}
			<div className="flex items-center justify-between gap-4">
				<h1 className="font-display flex items-center gap-2 text-2xl">
					<Activity className="size-6" />
					Activity
				</h1>
				{isOwnView && (
					<Button className="shrink-0" onClick={() => setIsNewTopicOpen(true)}>
						<Plus className="size-4" />
						New Topic
					</Button>
				)}
			</div>
			{/* the target user's profile link */}
			{activity && <UserProfileLink user={activity.user} className="mt-2 text-sm" />}
			{activity ? (
				<ActivitySections activity={activity} isOwnView={isOwnView} onReload={reloadActivity} />
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
	// the plain empty line an admin sees in place of a call-to-action link
	const emptyLine = (line: string) => <p className="text-muted-foreground pb-4 pl-4 text-sm">{line}</p>
	return (
		<div className="mt-2">
			<Accordion type="multiple" defaultValue={["subscriptions", "invites"]}>
				{/* the user's subscriptions with their active and email preferences */}
				<AccordionItem value="subscriptions">
					<AccordionTrigger className="font-semibold">Your topic subscriptions</AccordionTrigger>
					<AccordionContent>
						{activity.subscriptions.length > 0 ? (
							<TopicSubscriptionsTable
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

				{/* the invitations the user sent. the ones that were sent to them are subscriptions that are not active yet,
				    so they sit in the subscriptions table above */}
				<AccordionItem value="invites">
					<AccordionTrigger className="font-semibold">Your topic invitations</AccordionTrigger>
					<AccordionContent>
						{activity.invites.length > 0 ? (
							<TopicInvitesTable invites={activity.invites} onReload={onReload} isReadOnly={!isOwnView} />
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
