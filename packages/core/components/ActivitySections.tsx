import type { ActivityResponse } from "@carlnotes/contracts/activity"
import type { ComponentType, ReactNode } from "react"
import { toSectionCountLabel } from "../lib/labels"

type Container = ComponentType<{ children: ReactNode }>
export type ActivitySectionsElements = {
	// the sections, both open at first
	Sections: Container
	Section: ComponentType<{
		value: "subscriptions" | "invites"
		title: string
		countLabel?: string
		children: ReactNode
	}>
	// an empty section's card, with its muted line and the link that starts one
	EmptyCard: Container
	EmptyText: ComponentType<{ children: string }>
	EmptyLink: ComponentType<{ href: string; children: string }>
}

/**
 * Composes the Activity page's sections: the topics a user follows, then the topic invites they sent, each with its
 * count and its table or its empty card.
 */
export function ActivitySections({
	activity: { subscriptions, invites },
	isOwnView,
	renderSubscriptionsTable,
	renderInvitesTable,
	elements: { Sections, Section, EmptyCard, EmptyText, EmptyLink },
}: {
	activity: Pick<ActivityResponse, "subscriptions" | "invites">
	// false for an admin reading another user's activity, whose empty sections say so plainly
	isOwnView: boolean
	renderSubscriptionsTable: (subscriptions: ActivityResponse["subscriptions"]) => ReactNode
	renderInvitesTable: (invites: ActivityResponse["invites"]) => ReactNode
	elements: ActivitySectionsElements
}) {
	// an empty section asks its owner to start one, and tells an admin there is nothing
	const toEmptyCard = (linkText: string, emptyText: string) => (
		<EmptyCard>
			{isOwnView ? (
				<>
					<EmptyLink href="/">{linkText}</EmptyLink>
					<EmptyText> You know the one.</EmptyText>
				</>
			) : (
				<EmptyText>{emptyText}</EmptyText>
			)}
		</EmptyCard>
	)
	return (
		<Sections>
			{/* the user's subscriptions with their active and email preferences, and the invites sent to them */}
			<Section
				value="subscriptions"
				title="Topics you follow"
				countLabel={toSectionCountLabel(subscriptions.length, "topic")}
			>
				{subscriptions.length > 0
					? renderSubscriptionsTable(subscriptions)
					: toEmptyCard("Follow a topic.", "No subscriptions.")}
			</Section>

			{/* the invites the user sent */}
			<Section value="invites" title="Your topic invites" countLabel={toSectionCountLabel(invites.length, "invite")}>
				{invites.length > 0 ? renderInvitesTable(invites) : toEmptyCard("Share a topic.", "No invites.")}
			</Section>
		</Sections>
	)
}
