import { authClient } from "@carlnotes/client/authClient"
import type { NewsResponse } from "@carlnotes/contracts/news"
import type { ProfileResponse } from "@carlnotes/contracts/profilePage"
import {
	type ProfileSectionsElements,
	ProfileSections as SharedProfileSections,
} from "@carlnotes/core/components/ProfileSections"
import { useUpdatesOpener } from "@carlnotes/core/hooks/useUpdatesOpener"
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
	onReloadProfile,
	firstNewsPage,
}: {
	profile: ProfileResponse
	// the first page of the week's news, if the server read it with the profile
	firstNewsPage?: NewsResponse
	isOwnProfile: boolean
	onReloadProfile: () => void
}) {
	const navigate = useNavigate()
	const { data: session } = authClient().useSession()
	// carl's line for the day is written from the reader's own unread Findings, so it shows on their own profile alone
	const opener = useUpdatesOpener(isOwnProfile ? (session?.user.id ?? null) : null)
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
						firstPage={firstNewsPage}
					/>
				}
				renderOwnerTopicsTable={(ownTopics) => (
					<OwnerTopicsTable topics={ownTopics} profileUserId={profile.userId} onReloadPage={onReloadProfile} />
				)}
				topicsTable={<TopicsTable topics={profile.topics} includesNonPublicTopics={profile.includesNonPublicTopics} />}
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
