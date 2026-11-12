import { fetchActivity } from "@carlnotes/client/activityClient"
import { authClient } from "@carlnotes/client/authClient"
import { toSessionProfileIdentity } from "@carlnotes/contracts/profiles"
import { AvatarHeader, AvatarHeaderSkeleton } from "@carlnotes/core/components/AvatarHeader"
import { toSectionCountLabel } from "@carlnotes/core/lib/labels"
import { useQuery } from "@tanstack/react-query"
import { Activity } from "lucide-react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import {
	MOBILE_AVATAR_HEADER_ELEMENTS,
	MOBILE_AVATAR_HEADER_SKELETON_ELEMENTS,
} from "@/components/common/avatarHeaderElements"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { UserMenuUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { PageScreen } from "@/components/layout/PageScreen"
import { PageSkeleton } from "@/components/layout/PageSkeleton"
import { Text } from "@/components/primitives/text"
import { EmptyListCard } from "@/components/table/TableCard"
import { TopicInvitesTable } from "@/components/table/TopicInvitesTable"
import { TopicSubscriptionsTable } from "@/components/table/TopicSubscriptionsTable"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { NewTopicButton } from "@/components/topic/TopicHomeActions"

/**
 * Shows the signed-in user's follows and sent invitations with native actions.
 */
export default function ActivityScreen() {
	// keep activity private to its account and support pull-to-refresh
	const { data: session } = authClient().useSession()
	const query = useQuery({
		queryKey: ["activity", session?.user.id],
		queryFn: () => fetchActivity(),
		enabled: Boolean(session),
	})
	const handleReload = (): void => {
		void query.refetch()
	}
	return (
		<PageScreen
			hasNewTopicButton={true}
			title="Activity"
			icon={Activity}
			titleBadge={<UserMenuUpdateCountBadge label="Activity" />}
			byline={
				session ? (
					<AvatarHeader
						subject={{ subjectKind: "user", user: toSessionProfileIdentity(session.user) }}
						elements={MOBILE_AVATAR_HEADER_ELEMENTS}
					/>
				) : (
					<AvatarHeaderSkeleton elements={MOBILE_AVATAR_HEADER_SKELETON_ELEMENTS} />
				)
			}
			contentClassName="mt-2 gap-0"
			action={<NewTopicButton />}
			onRefresh={handleReload}
			isRefreshing={query.isRefetching}
		>
			{/* the same identity and two sections as the web Activity page */}
			{query.data ? (
				<>
					<CollapsibleSection
						title="Topics you follow"
						countLabel={toSectionCountLabel(query.data.subscriptions.length, "topic")}
					>
						{query.data.subscriptions.length ? (
							<TopicSubscriptionsTable subscriptions={query.data.subscriptions} onReloadPage={handleReload} />
						) : (
							<EmptyListCard>
								<AnchorLink href="/" accessibilityLabel="Follow a topic">
									<Text className="text-sm text-link">Follow a topic. You know the one.</Text>
								</AnchorLink>
							</EmptyListCard>
						)}
					</CollapsibleSection>
					<CollapsibleSection
						title="Your topic invites"
						countLabel={toSectionCountLabel(query.data.invites.length, "invite")}
					>
						{query.data.invites.length ? (
							<TopicInvitesTable invites={query.data.invites} onReload={handleReload} />
						) : (
							<EmptyListCard>
								<AnchorLink href="/" accessibilityLabel="Share a topic">
									<Text className="text-sm text-link">Share a topic. You know the one.</Text>
								</AnchorLink>
							</EmptyListCard>
						)}
					</CollapsibleSection>
				</>
			) : query.isError ? (
				<LoadFailedNotice message="Activity didn't load." retryLabel="Retry loading activity" onRetry={handleReload} />
			) : (
				<PageSkeleton kind="activity" />
			)}
		</PageScreen>
	)
}
