import { fetchActivity } from "@carlnotes/client/activityClient"
import { authClient } from "@carlnotes/client/authClient"
import { useQuery } from "@tanstack/react-query"
import { Activity } from "lucide-react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { PageScreen } from "@/components/layout/PageScreen"
import { PageSkeleton } from "@/components/layout/PageSkeleton"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
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
			byline={query.data && <UserProfileLink user={query.data.user} />}
			contentClassName="mt-2 gap-0"
			action={<NewTopicButton />}
			onRefresh={handleReload}
			isRefreshing={query.isRefetching}
		>
			{/* the same identity and two sections as the web Activity page */}
			{query.data ? (
				<>
					<CollapsibleSection title="Topics you follow">
						{query.data.subscriptions.length ? (
							<TopicSubscriptionsTable subscriptions={query.data.subscriptions} onReloadPage={handleReload} />
						) : (
							<AnchorLink href="/" accessibilityLabel="Follow a topic">
								<Text className="text-sm text-link">Follow a topic. You know the one.</Text>
							</AnchorLink>
						)}
					</CollapsibleSection>
					<CollapsibleSection title="Your topic invitations">
						{query.data.invites.length ? (
							<TopicInvitesTable invites={query.data.invites} onReload={handleReload} />
						) : (
							<AnchorLink href="/" accessibilityLabel="Share a topic">
								<Text className="text-sm text-link">Share a topic. You know the one.</Text>
							</AnchorLink>
						)}
					</CollapsibleSection>
				</>
			) : query.isError ? (
				<Button variant="outline" accessibilityLabel="Retry activity" onPress={handleReload}>
					<Text>Retry loading activity</Text>
				</Button>
			) : (
				<PageSkeleton kind="activity" />
			)}
		</PageScreen>
	)
}
