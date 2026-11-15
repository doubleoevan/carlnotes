import { authClient } from "@carlnotes/client/authClient"
import type { ProfileResponse } from "@carlnotes/contracts/profilePage"
import type { ProfileAudience } from "@carlnotes/contracts/profiles"
import {
	type ProfileSectionsElements,
	ProfileSections as SharedProfileSections,
} from "@carlnotes/core/components/ProfileSections"
import { useProfileUpdatesOpener } from "@carlnotes/core/hooks/useUpdatesOpener"
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
	audience,
	onAudienceChange,
	onReload,
}: {
	profile: ProfileResponse
	isOwnProfile: boolean
	// the page's audience, and for an admin on someone else's profile, the news card's select that changes it
	audience?: ProfileAudience
	onAudienceChange?: (audience: ProfileAudience) => void
	onReload: () => void
}) {
	const { data: session } = authClient().useSession()
	// carl's line for the day shows on the person's own profile, and to an admin on anyone else's in the user audience
	const opener = useProfileUpdatesOpener({
		profileUserId: profile.userId,
		userId: session?.user.id ?? null,
		includesNonPublicTopics: profile.includesNonPublicTopics,
		audience,
	})
	return (
		<SharedProfileSections
			profile={profile}
			isOwnProfile={isOwnProfile}
			newsList={
				<NewsList
					profileUserId={profile.userId}
					userId={session?.user.id ?? null}
					opener={opener}
					audience={audience}
					onAudienceChange={onAudienceChange}
				/>
			}
			renderOwnerTopicsTable={(loadedOwnTopics) => (
				<OwnerTopicsTable topics={loadedOwnTopics} profileUserId={profile.userId} onReloadPage={onReload} />
			)}
			topicsTable={
				<TopicsTable topics={profile.topics} includesNonPublicTopics={profile.includesNonPublicTopics} isOwnerShown />
			}
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
