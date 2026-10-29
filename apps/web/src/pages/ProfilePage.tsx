import { fetchActivity } from "@carlnotes/client/activityClient"
import { authClient } from "@carlnotes/client/authClient"
import { fetchProfile, fetchProfileTeamStatuses } from "@carlnotes/client/profileClient"
import { fetchAddableTopics } from "@carlnotes/client/topicClient"
import type { OwnerTopic } from "@carlnotes/contracts/activity"
import type { ProfileResponse, ProfileTeamStatus } from "@carlnotes/contracts/profiles"
import { useUserMenuUpdateBadges } from "@carlnotes/core/hooks/useUpdateCounts"
import { toProfileChatContext } from "@carlnotes/core/lib/chatConversations"
import { toCountLabel } from "@carlnotes/core/lib/labels"
import { REQUEST_FAILED_TEXT } from "@carlnotes/core/lib/sessionCopy"
import { toBlockLabel, toggleUserBlock } from "@carlnotes/core/lib/userBlocks"
import { cn } from "@carlnotes/nightshift/classNames"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { Ban, Pencil, Plus, Users } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { EditProfileModal } from "@/components/account/EditProfileModal"
import { UserAvatarPicker } from "@/components/avatar/UserAvatarPicker"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { UpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { PageSkeleton, TableSkeleton } from "@/components/layout/PageSkeleton"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"
import { Button } from "@/components/primitives/button"
import { toSignupNavigation } from "@/components/session/signupPrompts"
import { OwnerTopicsTable } from "@/components/table/OwnerTopicsTable"
import { TeamsMembershipTable } from "@/components/table/TeamsMembershipTable"
import { TopicsTable } from "@/components/table/TopicsTable"
import { EditTeamModal } from "@/components/team/EditTeamModal"
import { InviteUserToTeamButton } from "@/components/team/InviteUserToTeamButton"
import { NewTopicButton, useNewTopicDialog } from "@/components/topic/TopicEditorChoiceDialog"
import { useLoadInBrowser } from "@/hooks/useBrowserValue"
import { usePageTitle } from "@/hooks/usePageTitle"
import { CARD_CLASS, PAGE_CLASS, STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { openNewTopicChat, useRegisterChatContext } from "@/stores/chatPanelStore"
import { type PageActionOption, useRegisterPageActions } from "@/stores/pageActionsStore"

// the owner's edit and new-team actions, or the block of another person
function toProfileActionOptions({
	isOwnProfile,
	isBlocked,
	onEditProfile,
	onNewTeam,
	onToggleBlock,
}: {
	isOwnProfile: boolean
	isBlocked: boolean
	onEditProfile: () => void
	onNewTeam: () => void
	onToggleBlock: () => void
}): PageActionOption[] {
	return isOwnProfile
		? [
				{ label: "Edit profile", Icon: Pencil, onSelect: onEditProfile },
				{ label: "New team", Icon: Plus, onSelect: onNewTeam },
			]
		: [{ label: toBlockLabel(isBlocked), Icon: Ban, onSelect: onToggleBlock }]
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
	const [profile, setProfile] = useState<ProfileResponse | null>(loadedProfile)
	const [isProfileMissing, setIsProfileMissing] = useState(false)
	const { openNewTopicDialog, newTopicDialog } = useNewTopicDialog()
	const [isEditingProfile, setIsEditingProfile] = useState(false)
	const [isNewTeamModalOpen, setIsNewTeamModalOpen] = useState(false)
	const [addableTopics, setAddableTopics] = useState<{ id: string; name: string }[]>([])
	usePageTitle(profile?.username ?? null)

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
					page: "Profile",
					options: toProfileActionOptions({
						isOwnProfile,
						isBlocked: profile.isBlocked,
						onEditProfile: () => setIsEditingProfile(true),
						onNewTeam: () => void handleOpenNewTeamModal(),
						onToggleBlock: () => void handleToggleBlock(),
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
	const handleToggleBlock = async (): Promise<void> => {
		if (!profile) {
			return
		}
		try {
			await toggleUserBlock({ userId: profile.userId, isBlocked: profile.isBlocked })
			reloadProfilePage()
		} catch {
			toast.error(REQUEST_FAILED_TEXT)
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
			{/* the profile owner can create a topic. a different user can invite the profile user to a team */}
			<ProfileHeader
				profile={profile}
				profileTeamStatuses={profileTeamStatuses}
				onLoadProfileTeamStatuses={handleLoadProfileTeamStatuses}
				onNewTopic={session?.user.id === profile.userId ? openNewTopicDialog : undefined}
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
			/>
			{/* the dialog that the New Topic button opens */}
			{newTopicDialog}
		</main>
	)
}

// the topics and teams sections. each is an accordion item containing a table
export function ProfileSections({
	profile,
	isOwnProfile,
	topics,
	isTopicsLoadFailed,
	onLoadTopics,
	onReloadProfile,
}: {
	profile: ProfileResponse
	isOwnProfile: boolean
	topics: OwnerTopic[] | null
	isTopicsLoadFailed: boolean
	onLoadTopics: () => void
	onReloadProfile: () => void
}) {
	const navigate = useNavigate()
	return (
		<div className="mt-2">
			<Accordion type="multiple" defaultValue={["topics", "teams"]}>
				<AccordionItem value="topics">
					<AccordionTrigger className="font-semibold">
						{isOwnProfile ? "Your topics" : toCountLabel(profile.topics.length, "topic")}
					</AccordionTrigger>
					<AccordionContent>
						{/* your own profile manages the topics. other users see the profile table, or a muted line if the
						    profile has no topics */}
						{isOwnProfile ? (
							topics === null ? (
								<TopicsLoading isFailed={isTopicsLoadFailed} onRetry={onLoadTopics} />
							) : topics.length === 0 ? (
								<div className={cn(CARD_CLASS, "mb-4")}>
									<button
										type="button"
										onClick={() => openNewTopicChat()}
										className={cn(STANDALONE_LINK_CLASS, "font-display text-lg")}
									>
										Give Carl a topic. You know the one.
									</button>
								</div>
							) : (
								<OwnerTopicsTable topics={topics} onReloadPage={onLoadTopics} />
							)
						) : profile.topics.length > 0 ? (
							<TopicsTable topics={profile.topics} includesNonPublicTopics={profile.includesNonPublicTopics} />
						) : (
							<p className="text-muted-foreground text-sm">No public topics.</p>
						)}
					</AccordionContent>
				</AccordionItem>
				<AccordionItem value="teams">
					<AccordionTrigger className="font-semibold">
						{isOwnProfile ? "Your teams" : toCountLabel(profile.teams.length, "team")}
					</AccordionTrigger>
					<AccordionContent>
						{profile.teams.length > 0 ? (
							<TeamsMembershipTable
								teams={profile.teams}
								receivedInvites={[]}
								isReadOnly={!isOwnProfile}
								onLeave={() => navigate({ to: "/teams" })}
								onDelete={() => navigate({ to: "/teams" })}
								onAnswered={onReloadProfile}
							/>
						) : (
							<p className="text-muted-foreground text-sm">
								{isOwnProfile ? "You are on no teams yet." : "No public teams."}
							</p>
						)}
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</div>
	)
}

// the avatar, the username, when they joined, and how many people subscribe to their topics
function ProfileHeader({
	profile,
	onNewTopic,
	onInviteUserToTeam,
	profileTeamStatuses,
	onLoadProfileTeamStatuses,
}: {
	profile: ProfileResponse
	onNewTopic?: () => void
	onInviteUserToTeam?: () => void
	profileTeamStatuses: ProfileTeamStatus[] | null
	onLoadProfileTeamStatuses: () => void
}) {
	const { data: session } = authClient().useSession()
	// the topics' unread chat mentions and note changes, the user menu's Profile row, summed on the avatar badge
	const profileUpdateBadges = useUserMenuUpdateBadges().Profile
	// the join month and year label
	const joinDateLabel = new Date(profile.joinedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })

	const isOwnProfile = session?.user.id === profile.userId
	return (
		<header>
			<div className="flex items-center gap-4">
				{isOwnProfile ? (
					<>
						{/* the user avatar with its one unread badge */}
						<span className="relative inline-block">
							<UserAvatarPicker userId={profile.userId} username={profile.username} className="size-16" />
							<UpdateCountBadge
								{...profileUpdateBadges}
								className="absolute -top-1 -right-1"
								countBadgeClassName="h-5 min-w-5 text-xs"
							/>
						</span>
						<AnchorLink href="/account" className="rounded-md hover:underline">
							<h1 className="font-display text-2xl">{profile.username}</h1>
						</AnchorLink>
					</>
				) : (
					<>
						{/* a user may not edit another user's avatar */}
						<UserAvatar
							userId={profile.userId}
							username={profile.username}
							avatarVersion={profile.avatarVersion}
							className="size-16"
						/>
						<h1 className="font-display text-2xl">{profile.username}</h1>
					</>
				)}
				{/* the right column: the owner's New Topic button on top. a different user sees the button that invites the
				    profile user to a team */}
				<div className="ml-auto flex flex-col items-end gap-1 self-start">
					{onNewTopic && <NewTopicButton onNewTopic={onNewTopic} />}
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
							<Button className="shrink-0" onClick={onInviteUserToTeam}>
								<Users className="size-4" />
								Team Up
							</Button>
						))}
				</div>
			</div>
			{/* when they joined, and the number of unique people subscribed to their topics */}
			<p className="text-muted-foreground mt-2 text-sm">
				{`Joined ${joinDateLabel} · ${toCountLabel(profile.subscriberCount, "follower")}`}
			</p>
		</header>
	)
}

// offer retry after a failed first read instead of leaving a permanent skeleton
function TopicsLoading({ isFailed, onRetry }: { isFailed: boolean; onRetry: () => void }) {
	return isFailed ? (
		<Button variant="outline" onClick={onRetry}>
			Retry loading topics
		</Button>
	) : (
		<TableSkeleton />
	)
}
