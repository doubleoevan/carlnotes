import type { ActivityResponse } from "@shared/contracts"
import { useEffect, useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"
import { InvitesTable } from "@/components/table/InvitesTable"
import { SubscriptionsTable } from "@/components/table/SubscriptionsTable"
import { TopicsTable } from "@/components/table/TopicsTable"
import { fetchActivity } from "@/lib/activityClient"
import { authClient } from "@/lib/authClient"

/**
 * The Activity page: the signed-in user's topics with month-to-date scan spend, their subscriptions, and the invitations they sent.
 */
export function ActivityPage() {
	const { data: session } = authClient.useSession()
	const [activity, setActivity] = useState<ActivityResponse | null>(null)

	// load the user's activity
	useEffect(() => {
		if (session) {
			fetchActivity().then(setActivity)
		}
	}, [session])

	if (!session) {
		return <main className="mx-auto max-w-4xl px-safe py-10">Please log in to see your activity.</main>
	}

	return (
		<main className="mx-auto max-w-4xl px-safe py-10">
			<h1 className="font-display text-2xl">Activity</h1>
			{activity ? (
				<ActivitySections activity={activity} onReload={() => fetchActivity().then(setActivity)} />
			) : (
				<CoffeeLoading />
			)}
		</main>
	)
}

// the loaded page: the topics, subscriptions, and invites sections, each in an accordion that starts open
function ActivitySections({ activity, onReload }: { activity: ActivityResponse; onReload: () => void }) {
	return (
		<div className="mt-6">
			<Accordion type="multiple" defaultValue={["topics", "subscriptions", "invites"]}>
				{/* the user's topics with their monthly spend */}
				<AccordionItem value="topics" className="border-b-0">
					<AccordionTrigger className="font-semibold">Your topics</AccordionTrigger>
					<AccordionContent>
						<TopicsTable topics={activity.topics} />
					</AccordionContent>
				</AccordionItem>

				{/* the user's subscriptions with their active and email preferences */}
				{activity.subscriptions.length > 0 && (
					<AccordionItem value="subscriptions" className="border-b-0">
						<AccordionTrigger className="font-semibold">Your subscriptions</AccordionTrigger>
						<AccordionContent>
							<SubscriptionsTable subscriptions={activity.subscriptions} onReloadPage={onReload} />
						</AccordionContent>
					</AccordionItem>
				)}

				{/* the user's invitations with their status */}
				{activity.invites.length > 0 && (
					<AccordionItem value="invites" className="border-b-0">
						<AccordionTrigger className="font-semibold">Your invitations</AccordionTrigger>
						<AccordionContent>
							<InvitesTable invites={activity.invites} onReload={onReload} />
						</AccordionContent>
					</AccordionItem>
				)}
			</Accordion>
		</div>
	)
}
