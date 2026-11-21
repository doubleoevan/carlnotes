import { showClientError } from "@carlnotes/client/apiClient"
import { authClient } from "@carlnotes/client/authClient"
import { fetchProfilePageRead } from "@carlnotes/client/pageReadClient"
import type { ProfileAudience } from "@carlnotes/contracts/profiles"
import { useProfileAudience } from "@carlnotes/core/hooks/useProfileAudience"
import { toTopicPostsPageOptions } from "@carlnotes/core/lib/cardSections"
import { toProfileWithUserState } from "@carlnotes/core/lib/pageUserStates"
import { sendProfileViewOnce } from "@carlnotes/core/lib/pageViews"
import {
	sendProfileOrderMoves,
	toProfileRankDialogItems,
	toProfileRankedNouns,
} from "@carlnotes/core/lib/profileSections"
import {
	type FeaturedOrderMove,
	PROFILE_RANK_OPTION_LABELS,
	type RankedNoun,
	toProfileRankDialogLabels,
} from "@carlnotes/core/lib/rankDialog"
import { REQUEST_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import { toggleUserBlock, toUserBlockLabel } from "@carlnotes/core/lib/userBlocks"
import { useQuery } from "@tanstack/react-query"
import { useFocusEffect, useLocalSearchParams, usePathname } from "expo-router"
import { Ban, Clapperboard, ListOrdered, type LucideIcon, NotebookPen, Pencil, Plus } from "lucide-react-native"
import { useCallback, useState } from "react"
import { ProfileFields } from "@/components/account/AccountSettings"
import { ProfileHeader } from "@/components/account/ProfileHeader"
import { ProfileSections } from "@/components/account/ProfileSections"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { RankDialog } from "@/components/common/RankDialog"
import { Sheet } from "@/components/common/Sheet"
import { ViewerCountLine } from "@/components/common/ViewerCountLine"
import { PageScreen } from "@/components/layout/PageScreen"
import { PageSkeleton } from "@/components/layout/PageSkeleton"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { EditTeamModal } from "@/components/team/EditTeamModal"
import { InviteUserToTeamButton } from "@/components/team/InviteUserToTeamButton"
import { NewTopicButton } from "@/components/topic/TopicHomeActions"
import {
	PLAIN_PAGE_BUTTON_CLASS,
	PLAIN_PAGE_BUTTON_ICON_CLASS,
	PLAIN_PAGE_BUTTON_TEXT_CLASS,
} from "@/pageButtonClasses"

// the icon of each feature option in the action menu
const PROFILE_RANK_OPTION_ICONS: Record<RankedNoun, LucideIcon> = {
	topics: ListOrdered,
	films: Clapperboard,
	podcasts: ListOrdered,
	posts: NotebookPen,
}

/**
 * Shows a user's profile, topics, and teams.
 */
export default function ProfileScreen() {
	// load the profile, which includes the person's own table rows on their own profile
	const { userId } = useLocalSearchParams<{ userId: string }>()
	const { data: session } = authClient().useSession()
	const [isEditing, setIsEditing] = useState(false)
	const [isCreatingTeam, setIsCreatingTeam] = useState(false)
	// which of the owner's rank sheets is open, or null if none is
	const [rankedNoun, setRankedNoun] = useState<RankedNoun | null>(null)
	const isOwnProfile = session?.user.id === userId

	// the audience the page shows to, which an admin on someone else's profile switches to the visitor audience. the
	// person's profile for the last audience stays on screen while the next one loads
	const profileAudience = useProfileAudience({ profileUserId: userId, isOwnProfile })
	const query = useQuery({
		queryKey: ["profile", session?.user.id, userId, profileAudience.audience],
		queryFn: async () => {
			// the page read with the user state merged into the shared copy, and the first page of the Topic Posts
			const profilePageRead = await fetchProfilePageRead(userId, profileAudience.audience, toTopicPostsPageOptions())
			return (
				profilePageRead && {
					...profilePageRead,
					profile: toProfileWithUserState(profilePageRead),
				}
			)
		},
		placeholderData: (previousProfilePageRead) =>
			previousProfilePageRead?.profile.userId === userId ? previousProfilePageRead : undefined,
	})
	const profile = query.data?.profile

	// count a loaded profile once per app runtime, as the web counts it once per tab
	const loadedProfileUserId = profile?.userId
	useFocusEffect(
		useCallback(() => {
			if (loadedProfileUserId) {
				sendProfileViewOnce(loadedProfileUserId)
			}
		}, [loadedProfileUserId]),
	)
	// refresh the profile, its own table rows included
	function handleReload(): void {
		void query.refetch()
	}

	// block or unblock this person, then reload the profile
	async function handleToggleUserBlock(): Promise<void> {
		if (!profile) {
			return
		}
		try {
			await toggleUserBlock({ userId, isUserBlocked: profile.isBlocked })
			handleReload()
		} catch {
			showClientError(REQUEST_FAILED_TEXT)
		}
	}

	// send a rank sheet's moves one at a time, then reload the profile once. a rejected move keeps the sheet open
	async function handleSaveProfileOrder(featuredOrderMoves: FeaturedOrderMove[]): Promise<void> {
		try {
			await sendProfileOrderMoves(rankedNoun ?? "topics", featuredOrderMoves)
		} catch (error) {
			showClientError(REQUEST_FAILED_TEXT)
			throw error
		} finally {
			await query.refetch()
		}
	}
	return (
		<PageScreen
			hasNewTopicButton={isOwnProfile}
			title="Café"
			contentClassName={query.isPending ? "mt-0 gap-0" : "mt-2 gap-0"}
			onRefresh={handleReload}
			isRefreshing={query.isRefetching}
			report={
				profile
					? {
							subjectKind: "profile",
							subjectId: userId,
							subjectLabel: profile.username,
							author: { id: userId, username: profile.username },
						}
					: undefined
			}
			options={
				isOwnProfile
					? [
							{ label: "Edit Café", icon: Pencil, onSelect: () => setIsEditing(true) },
							// the featured items the person may order, in the card sections' order
							...toProfileRankedNouns(isOwnProfile).map((profileRankedNoun) => ({
								label: PROFILE_RANK_OPTION_LABELS[profileRankedNoun],
								icon: PROFILE_RANK_OPTION_ICONS[profileRankedNoun],
								onSelect: () => setRankedNoun(profileRankedNoun),
							})),
							{ label: "New team", icon: Plus, onSelect: () => setIsCreatingTeam(true) },
						]
					: profile && session
						? [{ label: toUserBlockLabel(profile.isBlocked), icon: Ban, onSelect: () => void handleToggleUserBlock() }]
						: []
			}
			header={
				query.isPending
					? false
					: profile && (
							<ProfileHeader profile={profile} isOwnProfile={isOwnProfile} topicCount={profile.topics.length} />
						)
			}
			// the owner starts a team, and a different user invites the profile user to one, in the plain style with the
			// icon alone in the highlight color
			leftButton={
				profile &&
				(isOwnProfile ? (
					<Button
						variant="outline"
						className={PLAIN_PAGE_BUTTON_CLASS}
						accessibilityLabel="New team"
						onPress={() => setIsCreatingTeam(true)}
					>
						<Icon as={Plus} className={PLAIN_PAGE_BUTTON_ICON_CLASS} />
						<Text className={PLAIN_PAGE_BUTTON_TEXT_CLASS}>New team</Text>
					</Button>
				) : (
					<InviteUserToTeamButton profileUserId={userId} profileUsername={profile.username} />
				))
			}
			// the loading state draws both buttons' placeholders, so the row waits for the profile
			topicButton={query.isPending ? undefined : <NewTopicButton />}
		>
			<ProfileContent
				query={query}
				isOwnProfile={isOwnProfile}
				audience={profileAudience.audience}
				onAudienceChange={profileAudience.changeAudience}
				onReload={handleReload}
			/>
			{isEditing && (
				<Sheet title="Edit Café" onClose={() => setIsEditing(false)}>
					<ProfileFields onUsernameChanged={handleReload} />
				</Sheet>
			)}
			{isCreatingTeam && <EditTeamModal onClose={() => setIsCreatingTeam(false)} />}
			{/* the owner's list of featured topics, films, podcast episodes, or Topic Posts, with the ones they may still
			    feature */}
			{rankedNoun && isOwnProfile && profile && (
				<RankDialog
					labels={toProfileRankDialogLabels(rankedNoun)}
					{...toProfileRankDialogItems(rankedNoun, profile)}
					onSave={handleSaveProfileOrder}
					onClose={() => setRankedNoun(null)}
				/>
			)}
		</PageScreen>
	)
}

// show the two profile tables only after the profile request has resolved
function ProfileContent({
	query,
	isOwnProfile,
	audience,
	onAudienceChange,
	onReload,
}: {
	query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchProfilePageRead>>>>
	isOwnProfile: boolean
	audience: ProfileAudience
	onAudienceChange?: (audience: ProfileAudience) => void
	onReload: () => void
}) {
	const profile = query.data?.profile
	const pathname = usePathname()
	if (query.isPending) {
		return <PageSkeleton kind="profile" />
	}
	if (!profile) {
		return query.error ? (
			<LoadFailedNotice message="The Café didn't load." retryLabel="Retry loading the Café" onRetry={onReload} />
		) : (
			<Text>No one here by that name.</Text>
		)
	}
	return (
		<>
			<ProfileSections
				profile={profile}
				firstNewsPage={query.data?.news ?? undefined}
				isOwnProfile={isOwnProfile}
				audience={audience}
				onAudienceChange={onAudienceChange}
				onReload={onReload}
			/>
			{/* the profile's visitors, read while this profile is the active route */}
			<ViewerCountLine
				viewerCountPage={{ kind: "profile", id: profile.userId }}
				savedViewerCount={profile.viewerCount}
				isActiveRoute={pathname === `/profiles/${profile.userId}`}
			/>
		</>
	)
}
