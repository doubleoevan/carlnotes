import { fetchActivity } from "@carlnotes/client/activityClient"
import { authClient } from "@carlnotes/client/authClient"
import { fetchProfile, fetchProfileTeamStatuses } from "@carlnotes/client/profileClient"
import { fetchAddableTopics } from "@carlnotes/client/topicClient"
import type { OwnerTopic } from "@carlnotes/contracts/activity"
import { type ProfileResponse, toProfilePageTitle } from "@carlnotes/contracts/profilePage"
import type { ProfileTeamStatus } from "@carlnotes/contracts/profiles"
import { toProfileChatContext } from "@carlnotes/core/lib/chatConversations"
import { sendProfileViewOnce } from "@carlnotes/core/lib/pageViews"
import {
	sendProfileOrderMoves,
	toProfileRankDialogItems,
	toProfileRankedNouns,
	toProfileTopicCount,
} from "@carlnotes/core/lib/profileSections"
import {
	type PinnedOrderMove,
	PROFILE_RANK_OPTION_LABELS,
	type RankedNoun,
	toProfileRankDialogLabels,
} from "@carlnotes/core/lib/rankDialog"
import { REQUEST_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import { toggleUserBlock, toUserBlockLabel } from "@carlnotes/core/lib/userBlocks"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { Ban, Clapperboard, ListOrdered, type LucideIcon, NotebookPen, Pencil, Plus, Users } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { EditProfileModal } from "@/components/account/EditProfileModal"
import { ProfileHeader } from "@/components/account/ProfileHeader"
import { ProfileSections } from "@/components/account/ProfileSections"
import { RankDialog } from "@/components/common/RankDialog"
import { ViewerCountLine } from "@/components/common/ViewerCountLine"
import { PageSkeleton } from "@/components/layout/PageSkeleton"
import { toSignupNavigation } from "@/components/session/signupPrompts"
import { EditTeamModal } from "@/components/team/EditTeamModal"
import { InviteUserToTeamButton } from "@/components/team/InviteUserToTeamButton"
import { NewTopicButton, useNewTopicDialog } from "@/components/topic/TopicEditorChoiceDialog"
import { useLoadInBrowser } from "@/hooks/useBrowserValue"
import { usePageTitle } from "@/hooks/usePageTitle"
import {
	PAGE_BUTTON_ROW_CLASS,
	PAGE_CLASS,
	PLAIN_PAGE_BUTTON_CLASS,
	PLAIN_PAGE_BUTTON_ICON_CLASS,
} from "@/lib/styleClasses"
import { useRegisterChatContext } from "@/stores/chatPanelStore"
import { type PageActionOption, useRegisterPageActions } from "@/stores/pageActionsStore"

// the icon of each pin option in the action menu
const PROFILE_RANK_OPTION_ICONS: Record<RankedNoun, LucideIcon> = {
	topics: ListOrdered,
	films: Clapperboard,
	podcasts: ListOrdered,
	posts: NotebookPen,
}

// the owner's edit, pin, and new-team actions, or the block of another person
function toProfileActionOptions({
	isOwnProfile,
	isUserBlocked,
	onEditProfile,
	onRank,
	onNewTeam,
	onToggleUserBlock,
}: {
	isOwnProfile: boolean
	isUserBlocked: boolean
	onEditProfile: () => void
	onRank: (rankedNoun: RankedNoun) => void
	onNewTeam: () => void
	onToggleUserBlock: () => void
}): PageActionOption[] {
	// the pins the person may order, in the card sections' order
	const rankOptions = toProfileRankedNouns(isOwnProfile).map((rankedNoun) => ({
		label: PROFILE_RANK_OPTION_LABELS[rankedNoun],
		Icon: PROFILE_RANK_OPTION_ICONS[rankedNoun],
		onSelect: () => onRank(rankedNoun),
	}))
	return isOwnProfile
		? [
				{ label: "Edit Café", Icon: Pencil, onSelect: onEditProfile },
				...rankOptions,
				{ label: "New team", Icon: Plus, onSelect: onNewTeam },
			]
		: [{ label: toUserBlockLabel(isUserBlocked), Icon: Ban, onSelect: onToggleUserBlock }]
}

// the profile route, whose loader reads the profile on the server
const profileRoute = getRouteApi("/_layout/profiles/$userId")

/**
 * A user's public profile: their avatar, username, subscriber count, when they joined, and their public Topics,
 * with the owner's non-public topics only shown to the owner or an admin.
 */
export function ProfilePage() {
	const { userId } = profileRoute.useParams()
	const navigate = useNavigate()
	const { data: session } = authClient().useSession()
	// the profile the route loads on the server, or null after a browser navigation
	const loadedProfile = profileRoute.useLoaderData({ select: (loaderData) => loaderData?.profile ?? null })
	// the first page of the week's news, for the profile the server loaded alone
	const loadedNewsPage = profileRoute.useLoaderData({ select: (loaderData) => loaderData?.newsPage ?? undefined })
	const [profile, setProfile] = useState<ProfileResponse | null>(loadedProfile)
	const [isProfileMissing, setIsProfileMissing] = useState(false)
	const { openNewTopicDialog, newTopicDialog } = useNewTopicDialog()
	const [isEditingProfile, setIsEditingProfile] = useState(false)
	const [isNewTeamModalOpen, setIsNewTeamModalOpen] = useState(false)
	// which of the owner's rank dialogs is open, or null if none is
	const [rankedNoun, setRankedNoun] = useState<RankedNoun | null>(null)
	const [addableTopics, setAddableTopics] = useState<{ id: string; name: string }[]>([])
	usePageTitle(profile ? toProfilePageTitle(profile.username) : null)

	// a user on their own profile manages their topics in the owner topics table
	const isOwnProfile = Boolean(session) && session?.user.id === profile?.userId
	const [topics, setTopics] = useState<OwnerTopic[] | null>(null)
	const [isTopicsLoadFailed, setIsTopicsLoadFailed] = useState(false)
	const handleLoadTopics = useCallback(async (): Promise<void> => {
		setIsTopicsLoadFailed(false)
		try {
			setTopics((await fetchActivity()).topics)
		} catch {
			setIsTopicsLoadFailed(true)
		}
	}, [])

	// reload the profile after a change to its teams or topics
	const handleReloadProfile = useCallback(async (): Promise<void> => {
		setProfile(await fetchProfile(userId))
	}, [userId])

	// load a user's own topics
	useEffect(() => {
		if (isOwnProfile) {
			handleLoadTopics().catch((error) => console.error("own topics load failed", error))
		}
	}, [isOwnProfile, handleLoadTopics])

	// load the user's teams, each with the profile user's status there
	const [profileTeamStatuses, setProfileTeamStatuses] = useState<ProfileTeamStatus[] | null>(null)
	const handleLoadProfileTeamStatuses = useCallback((): void => {
		fetchProfileTeamStatuses(userId)
			.then(setProfileTeamStatuses)
			.catch(() => setProfileTeamStatuses([]))
	}, [userId])
	useEffect(() => handleLoadProfileTeamStatuses(), [handleLoadProfileTeamStatuses])

	// the teams shared with this profile for the chat context
	useRegisterChatContext(
		toProfileChatContext({ profile, profileTeamStatuses: profileTeamStatuses ?? [], isOwnProfile }),
	)

	// this page's action menu options
	useRegisterPageActions(
		profile && session
			? {
					page: "Café",
					options: toProfileActionOptions({
						isOwnProfile,
						isUserBlocked: profile.isBlocked,
						onEditProfile: () => setIsEditingProfile(true),
						onRank: setRankedNoun,
						onNewTeam: () => void handleOpenNewTeamModal(),
						onToggleUserBlock: () => void handleToggleUserBlock(),
					}),
					report: {
						subjectKind: "profile",
						subjectId: profile.userId,
						subjectLabel: profile.username,
						author: { id: profile.userId, username: profile.username },
					},
					hasNewTopicButton: isOwnProfile,
				}
			: null,
	)

	// block or unblock this person, then reload the profile
	const handleToggleUserBlock = async (): Promise<void> => {
		if (!profile) {
			return
		}
		try {
			await toggleUserBlock({ userId: profile.userId, isUserBlocked: profile.isBlocked })
			reloadProfilePage()
		} catch {
			toast.error(REQUEST_FAILED_TEXT)
		}
	}

	// send a rank dialog's moves one at a time, then reload the profile once. a rejected move keeps the dialog open
	const handleSaveProfileOrder = async (pinnedOrderMoves: PinnedOrderMove[]): Promise<void> => {
		try {
			await sendProfileOrderMoves(rankedNoun ?? "topics", pinnedOrderMoves)
		} catch (error) {
			toast.error(REQUEST_FAILED_TEXT)
			throw error
		} finally {
			await handleReloadProfile()
		}
	}

	// load the topics that the New team modal offers, then open the modal
	const handleOpenNewTeamModal = async (): Promise<void> => {
		setAddableTopics(await fetchAddableTopics())
		setIsNewTeamModalOpen(true)
	}

	// load the profile, except while hydrating the profile the server loaded
	const reloadProfilePage = useCallback((): void => {
		// a new load clears the last profile's missing state, and a failed profile load shows the missing page
		setIsProfileMissing(false)
		fetchProfile(userId)
			.then((fetchedProfile) => (fetchedProfile ? setProfile(fetchedProfile) : setIsProfileMissing(true)))
			.catch((error) => {
				console.error("profile load failed", error)
				setIsProfileMissing(true)
			})
	}, [userId])
	useLoadInBrowser({ pageId: userId, isLoadedOnServer: loadedProfile !== null, loadPage: reloadProfilePage })

	// send the profile page's view once per tab, once the profile has loaded
	const loadedProfileUserId = profile?.userId
	useEffect(() => {
		if (loadedProfileUserId === userId) {
			sendProfileViewOnce(userId)
		}
	}, [userId, loadedProfileUserId])

	// show the missing page or the loading page
	if (isProfileMissing) {
		return <main className={PAGE_CLASS}>No one here by that name.</main>
	}
	if (!profile) {
		return (
			<main className={PAGE_CLASS}>
				<PageSkeleton kind="profile" />
			</main>
		)
	}

	// send a visitor to the sign-up page, or open the New team modal with the profile user invited
	const handleInviteUserToTeam = (): void => {
		if (!session) {
			void navigate(toSignupNavigation("profile-team-up"))
			return
		}
		void handleOpenNewTeamModal()
	}

	return (
		<main className={PAGE_CLASS}>
			{/* anyone can create a topic. the profile owner can start a team, and a different user can invite the profile
			    user to one */}
			<ProfilePageHeader
				profile={profile}
				topicCount={toProfileTopicCount({ profile, isOwnProfile, ownTopics: topics })}
				profileTeamStatuses={profileTeamStatuses}
				onLoadProfileTeamStatuses={handleLoadProfileTeamStatuses}
				onNewTopic={openNewTopicDialog}
				onNewTeam={session?.user.id === profile.userId ? () => void handleOpenNewTeamModal() : undefined}
				onInviteUserToTeam={session?.user.id === profile.userId ? undefined : handleInviteUserToTeam}
			/>
			{isEditingProfile && (
				<EditProfileModal
					userId={profile.userId}
					username={profile.username}
					onClose={() => setIsEditingProfile(false)}
					onUsernameChanged={handleReloadProfile}
				/>
			)}
			{isNewTeamModalOpen && (
				<EditTeamModal
					userTopics={addableTopics}
					initialInvites={isOwnProfile ? [] : [{ username: profile.username }]}
					onClose={() => setIsNewTeamModalOpen(false)}
				/>
			)}
			<ProfileSections
				profile={profile}
				topics={topics}
				isTopicsLoadFailed={isTopicsLoadFailed}
				isOwnProfile={isOwnProfile}
				onLoadTopics={handleLoadTopics}
				onReloadProfile={handleReloadProfile}
				firstNewsPage={loadedProfile?.userId === profile.userId ? loadedNewsPage : undefined}
			/>
			{/* the owner's list of pinned topics, films, podcast episodes, or Topic Posts, with the ones they may still
			    pin */}
			{rankedNoun && isOwnProfile && (
				<RankDialog
					labels={toProfileRankDialogLabels(rankedNoun)}
					{...toProfileRankDialogItems(rankedNoun, profile)}
					onSave={handleSaveProfileOrder}
					onClose={() => setRankedNoun(null)}
				/>
			)}
			{/* the profile page's visitors, as its last line */}
			<ViewerCountLine viewerCountPage={{ kind: "profile", id: profile.userId }} />
			{/* the dialog that the New Topic button opens */}
			{newTopicDialog}
		</main>
	)
}

// the page's button row under the search bar, then the shared header
function ProfilePageHeader({
	profile,
	topicCount,
	onNewTopic,
	onNewTeam,
	onInviteUserToTeam,
	profileTeamStatuses,
	onLoadProfileTeamStatuses,
}: {
	profile: ProfileResponse
	// how many topics the page's table lists, null until the person's own topics load
	topicCount: number | null
	onNewTopic: () => void
	// the owner starts a team, and a different user invites the profile user to one
	onNewTeam?: () => void
	onInviteUserToTeam?: () => void
	profileTeamStatuses: ProfileTeamStatus[] | null
	onLoadProfileTeamStatuses: () => void
}) {
	const { data: session } = authClient().useSession()
	return (
		<header>
			{/* the page's buttons under the search bar. at the left, in the plain style, the owner starts a team and a
			    different user invites the profile user to one, its icon alone in the highlight color. New Topic at the right
			    is the row's one highlighted button */}
			<div className={PAGE_BUTTON_ROW_CLASS}>
				{onNewTeam && (
					<button type="button" className={PLAIN_PAGE_BUTTON_CLASS} onClick={onNewTeam}>
						<Plus className={PLAIN_PAGE_BUTTON_ICON_CLASS} />
						New team
					</button>
				)}
				{onInviteUserToTeam &&
					(session ? (
						<InviteUserToTeamButton
							profileUserId={profile.userId}
							profileUsername={profile.username}
							profileTeamStatuses={profileTeamStatuses}
							onReloadProfileTeamStatuses={onLoadProfileTeamStatuses}
							onNewTeam={onInviteUserToTeam}
						/>
					) : (
						<button type="button" className={PLAIN_PAGE_BUTTON_CLASS} onClick={onInviteUserToTeam}>
							<Users className={PLAIN_PAGE_BUTTON_ICON_CLASS} />
							Team Up
						</button>
					))}
				<NewTopicButton onNewTopic={onNewTopic} />
			</div>
			{/* the avatar beside the person's Café name and summary line, with no button in the row */}
			<ProfileHeader profile={profile} isOwnProfile={session?.user.id === profile.userId} topicCount={topicCount} />
		</header>
	)
}
