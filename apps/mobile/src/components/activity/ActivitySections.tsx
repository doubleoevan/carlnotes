import type { ActivityResponse } from "@carlnotes/contracts/activity"
import {
	type ActivitySectionsElements,
	ActivitySections as SharedActivitySections,
} from "@carlnotes/core/components/ActivitySections"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Text } from "@/components/primitives/text"
import { EmptyListCard } from "@/components/table/TableCard"
import { TopicInvitesTable } from "@/components/table/TopicInvitesTable"
import { TopicSubscriptionsTable } from "@/components/table/TopicSubscriptionsTable"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"

/**
 * Renders the web's Activity sections: the topics the user follows and the topic invites they sent.
 */
export function ActivitySections({
	activity,
	onReload,
}: {
	activity: Pick<ActivityResponse, "subscriptions" | "invites">
	onReload: () => void
}) {
	return (
		<SharedActivitySections
			activity={activity}
			isOwnView
			renderSubscriptionsTable={(subscriptions) => (
				<TopicSubscriptionsTable subscriptions={subscriptions} onReloadPage={onReload} />
			)}
			renderInvitesTable={(invites) => <TopicInvitesTable invites={invites} onReload={onReload} />}
			elements={ACTIVITY_SECTIONS_ELEMENTS}
		/>
	)
}

// open collapsible sections, and the empty card's sentence with its link at the start
const ACTIVITY_SECTIONS_ELEMENTS: ActivitySectionsElements = {
	Sections: ({ children }) => <>{children}</>,
	Section: ({ title, countLabel, children }) => (
		<CollapsibleSection title={title} countLabel={countLabel}>
			{children}
		</CollapsibleSection>
	),
	EmptyCard: ({ children }) => (
		<EmptyListCard>
			<View className="flex-row flex-wrap items-center">{children}</View>
		</EmptyListCard>
	),
	EmptyText: ({ children }) => <Text className="text-sm text-muted-foreground">{children}</Text>,
	EmptyLink: ({ href, children }) => (
		<AnchorLink href={href} accessibilityLabel={children}>
			<Text className="text-sm text-link">{children}</Text>
		</AnchorLink>
	),
}
