import { authClient } from "@carlnotes/client/authClient"
import type { OwnerTopic } from "@carlnotes/contracts/activity"
import type { ProfileResponse } from "@carlnotes/contracts/profilePage"
import {
	type ProfileSectionsElements,
	ProfileSections as SharedProfileSections,
} from "@carlnotes/core/components/ProfileSections"
import { useUpdatesOpener } from "@carlnotes/core/hooks/useUpdatesOpener"
import { RETRY_LOADING_TOPICS_LABEL, TOPICS_LOAD_FAILED_LINE } from "@carlnotes/core/lib/profileSections"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { PAGE_SECTIONS_ELEMENTS } from "@/components/common/pageSectionsElements"
import { TableSkeleton } from "@/components/layout/PageSkeleton"
import { NewsList } from "@/components/social/NewsList"
import { OwnerTopicsTable } from "@/components/table/OwnerTopicsTable"
import { TeamsMembershipTable } from "@/components/table/TeamsMembershipTable"
import { TopicsTable } from "@/components/table/TopicsTable"
import { NewTopicEmptyCard } from "@/components/topic/NewTopicEmptyCard"

/**
 * Renders a profile screen's sections: the person's news, their card sections, and their topics and teams tables.
 */
export function ProfileSections({
	profile,
	isOwnProfile,
	ownTopics,
	isOwnTopicsLoadFailed,
	onReload,
}: {
	profile: ProfileResponse
	isOwnProfile: boolean
	// the person's own topics, or null until they load
	ownTopics: OwnerTopic[] | null
	isOwnTopicsLoadFailed: boolean
	onReload: () => void
}) {
	const { data: session } = authClient().useSession()
	// carl's line for the day is written from the reader's own unread Findings, so it shows on their own profile alone
	const opener = useUpdatesOpener(isOwnProfile ? (session?.user.id ?? null) : null)
	return (
		<SharedProfileSections
			profile={profile}
			isOwnProfile={isOwnProfile}
			ownTopics={ownTopics}
			isOwnTopicsLoadFailed={isOwnTopicsLoadFailed}
			onLoadOwnTopics={onReload}
			newsList={<NewsList profileUserId={profile.userId} userId={session?.user.id ?? null} opener={opener} />}
			renderOwnerTopicsTable={(loadedOwnTopics) => (
				<OwnerTopicsTable topics={loadedOwnTopics} onReloadPage={onReload} />
			)}
			topicsTable={<TopicsTable topics={profile.topics} includesNonPublicTopics={profile.includesNonPublicTopics} />}
			teamsTable={<TeamsMembershipTable teams={profile.teams} isReadOnly={!isOwnProfile} onChanged={onReload} />}
			elements={PROFILE_SECTIONS_ELEMENTS}
		/>
	)
}

// the shared page sections, and the load states of the person's own topics
const PROFILE_SECTIONS_ELEMENTS: ProfileSectionsElements = {
	...PAGE_SECTIONS_ELEMENTS,
	TableSkeleton,
	TopicsLoadFailed: ({ onRetry }) => (
		<LoadFailedNotice message={TOPICS_LOAD_FAILED_LINE} retryLabel={RETRY_LOADING_TOPICS_LABEL} onRetry={onRetry} />
	),
	NewTopicEmptyCard,
}
