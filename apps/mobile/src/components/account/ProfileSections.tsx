import { authClient } from "@carlnotes/client/authClient"
import type { ProfileResponse } from "@carlnotes/contracts/profilePage"
import {
	type ProfileSectionsElements,
	ProfileSections as SharedProfileSections,
} from "@carlnotes/core/components/ProfileSections"
import { useUpdatesOpener } from "@carlnotes/core/hooks/useUpdatesOpener"
import { PAGE_SECTIONS_ELEMENTS } from "@/components/common/pageSectionsElements"
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
	onReload,
}: {
	profile: ProfileResponse
	isOwnProfile: boolean
	onReload: () => void
}) {
	const { data: session } = authClient().useSession()
	// carl's line for the day is written from the reader's own unread Findings, so it shows on their own profile alone
	const opener = useUpdatesOpener(isOwnProfile ? (session?.user.id ?? null) : null)
	return (
		<SharedProfileSections
			profile={profile}
			isOwnProfile={isOwnProfile}
			newsList={<NewsList profileUserId={profile.userId} userId={session?.user.id ?? null} opener={opener} />}
			renderOwnerTopicsTable={(loadedOwnTopics) => (
				<OwnerTopicsTable topics={loadedOwnTopics} profileUserId={profile.userId} onReloadPage={onReload} />
			)}
			topicsTable={<TopicsTable topics={profile.topics} includesNonPublicTopics={profile.includesNonPublicTopics} />}
			teamsTable={<TeamsMembershipTable teams={profile.teams} isReadOnly={!isOwnProfile} onChanged={onReload} />}
			elements={PROFILE_SECTIONS_ELEMENTS}
		/>
	)
}

// the shared page sections, and the empty card of the person's own topics
const PROFILE_SECTIONS_ELEMENTS: ProfileSectionsElements = {
	...PAGE_SECTIONS_ELEMENTS,
	NewTopicEmptyCard,
}
