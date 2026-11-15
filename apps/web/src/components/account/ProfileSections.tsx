import { authClient } from "@carlnotes/client/authClient"
import type { NewsResponse } from "@carlnotes/contracts/news"
import type { ProfileResponse } from "@carlnotes/contracts/profilePage"
import type { ProfileAudience } from "@carlnotes/contracts/profiles"
import {
	type ProfileSectionsElements,
	ProfileSections as SharedProfileSections,
} from "@carlnotes/core/components/ProfileSections"
import { useProfileUpdatesOpener } from "@carlnotes/core/hooks/useUpdatesOpener"
import { PROFILE_SECTION_VALUES } from "@carlnotes/core/lib/profileSections"
import { cn } from "@carlnotes/nightshift/classNames"
import { useNavigate } from "@tanstack/react-router"
import { PAGE_SECTIONS_ELEMENTS } from "@/components/common/pageSectionsElements"
import { Accordion } from "@/components/primitives/accordion"
import { NewsList } from "@/components/social/NewsList"
import { OwnerTopicsTable } from "@/components/table/OwnerTopicsTable"
import { TeamsMembershipTable } from "@/components/table/TeamsMembershipTable"
import { TopicsTable } from "@/components/table/TopicsTable"
import { NewTopicEmptyCard } from "@/components/topic/NewTopicEmptyCard"
import { FLUSH_FIRST_SECTION_CLASS } from "@/lib/styleClasses"

/**
 * The person's news, their card sections, and their topics and teams tables, each in an accordion section.
 */
export function ProfileSections({
	profile,
	isOwnProfile,
	audience,
	onAudienceChange,
	onReloadProfile,
	firstNewsPage,
}: {
	profile: ProfileResponse
	// the first page of the week's news, if the server read it with the profile
	firstNewsPage?: NewsResponse
	isOwnProfile: boolean
	// the page's audience, and for an admin on someone else's profile, the news card's select that changes it
	audience?: ProfileAudience
	onAudienceChange?: (audience: ProfileAudience) => void
	onReloadProfile: () => void
}) {
	const navigate = useNavigate()
	const { data: session } = authClient().useSession()
	// carl's line for the day shows on the person's own profile, and to an admin on anyone else's in the user audience
	const opener = useProfileUpdatesOpener({
		profileUserId: profile.userId,
		userId: session?.user.id ?? null,
		includesNonPublicTopics: profile.includesNonPublicTopics,
		audience,
	})
	return (
		<div className="mt-2">
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
						firstPage={firstNewsPage}
					/>
				}
				renderOwnerTopicsTable={(ownTopics) => (
					<OwnerTopicsTable topics={ownTopics} profileUserId={profile.userId} onReloadPage={onReloadProfile} />
				)}
				topicsTable={
					<TopicsTable topics={profile.topics} includesNonPublicTopics={profile.includesNonPublicTopics} isOwnerShown />
				}
				teamsTable={
					<TeamsMembershipTable
						teams={profile.teams}
						receivedInvites={[]}
						isReadOnly={!isOwnProfile}
						onLeave={() => navigate({ to: "/teams" })}
						onDelete={() => navigate({ to: "/teams" })}
						onAnswered={onReloadProfile}
					/>
				}
				elements={PROFILE_SECTIONS_ELEMENTS}
			/>
		</div>
	)
}

// the shared page sections in the profile's own accordion, which sits as far under the news as the news sits under the
// avatar, and the own topics' load states
export const PROFILE_SECTIONS_ELEMENTS: ProfileSectionsElements = {
	...PAGE_SECTIONS_ELEMENTS,
	SectionsGroup: ({ children }) => (
		<Accordion
			type="multiple"
			defaultValue={[...PROFILE_SECTION_VALUES, "topics", "teams"]}
			className={cn("mt-4", FLUSH_FIRST_SECTION_CLASS)}
		>
			{children}
		</Accordion>
	),
	NewTopicEmptyCard,
}
