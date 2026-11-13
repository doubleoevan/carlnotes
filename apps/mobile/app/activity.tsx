import { fetchActivity } from "@carlnotes/client/activityClient"
import { authClient } from "@carlnotes/client/authClient"
import { toSessionProfileIdentity } from "@carlnotes/contracts/profiles"
import { AvatarHeader, AvatarHeaderSkeleton } from "@carlnotes/core/components/AvatarHeader"
import { useQuery } from "@tanstack/react-query"
import { Activity } from "lucide-react-native"
import { ActivitySections } from "@/components/activity/ActivitySections"
import {
	MOBILE_AVATAR_HEADER_ELEMENTS,
	MOBILE_AVATAR_HEADER_SKELETON_ELEMENTS,
} from "@/components/common/avatarHeaderElements"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { UserMenuUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { PageScreen } from "@/components/layout/PageScreen"
import { PageSkeleton } from "@/components/layout/PageSkeleton"
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
				<ActivitySections activity={query.data} onReload={handleReload} />
			) : query.isError ? (
				<LoadFailedNotice message="Activity didn't load." retryLabel="Retry loading activity" onRetry={handleReload} />
			) : (
				<PageSkeleton kind="activity" />
			)}
		</PageScreen>
	)
}
