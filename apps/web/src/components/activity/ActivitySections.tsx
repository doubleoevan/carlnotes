import type { ActivityResponse } from "@carlnotes/contracts/activity"
import {
	type ActivitySectionsElements,
	ActivitySections as SharedActivitySections,
} from "@carlnotes/core/components/ActivitySections"
import { AccordionSection } from "@/components/common/AccordionSection"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Accordion } from "@/components/primitives/accordion"
import { EmptyListCard } from "@/components/table/TableCard"
import { TopicInvitesTable } from "@/components/table/TopicInvitesTable"
import { TopicSubscriptionsTable } from "@/components/table/TopicSubscriptionsTable"
import { SECTIONS_UNDER_AVATAR_HEADER_CLASS } from "@/lib/styleClasses"

/**
 * The Activity page's loaded sections: the topics the user follows and the topic invites they sent.
 */
export function ActivitySections({
	activity,
	isOwnView,
	onReload,
}: {
	activity: Pick<ActivityResponse, "subscriptions" | "invites">
	// false for an admin reading another user's page, who sees disabled controls
	isOwnView: boolean
	onReload: () => void
}) {
	return (
		<SharedActivitySections
			activity={activity}
			isOwnView={isOwnView}
			renderSubscriptionsTable={(subscriptions) => (
				<TopicSubscriptionsTable subscriptions={subscriptions} onReloadPage={onReload} isReadOnly={!isOwnView} />
			)}
			renderInvitesTable={(invites) => (
				<TopicInvitesTable invites={invites} onReload={onReload} isReadOnly={!isOwnView} />
			)}
			elements={ACTIVITY_SECTIONS_ELEMENTS}
		/>
	)
}

// the page's accordion under the avatar header, its sections, and the empty card's sentence link
export const ACTIVITY_SECTIONS_ELEMENTS: ActivitySectionsElements = {
	Sections: ({ children }) => (
		<div className={SECTIONS_UNDER_AVATAR_HEADER_CLASS}>
			<Accordion type="multiple" defaultValue={["subscriptions", "invites"]}>
				{children}
			</Accordion>
		</div>
	),
	Section: ({ value, title, countLabel, children }) => (
		<AccordionSection value={value} title={title} countLabel={countLabel}>
			{children}
		</AccordionSection>
	),
	EmptyCard: ({ children }) => <EmptyListCard>{children}</EmptyListCard>,
	EmptyText: ({ children }) => <>{children}</>,
	EmptyLink: ({ href, children }) => (
		<AnchorLink href={href} className="sentence-link">
			{children}
		</AnchorLink>
	),
}
