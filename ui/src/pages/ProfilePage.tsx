import type { OwnerTopic, ProfileResponse, ProfileTeamStatus } from "@shared/contracts"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { Pencil, Plus, Users } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { fetchActivity } from "@/clients/activityClient"
import { authClient } from "@/clients/authClient"
import { fetchProfile, fetchProfileTeamStatuses } from "@/clients/profileClient"
import { fetchAddableTopics } from "@/clients/topicClient"
import { EditProfileModal } from "@/components/account/EditProfileModal"
import { UserAvatarPicker } from "@/components/avatar/UserAvatarPicker"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { UpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"
import { Button } from "@/components/primitives/button"
import { OwnerTopicsTable } from "@/components/table/OwnerTopicsTable"
import { TeamsMembershipTable } from "@/components/table/TeamsMembershipTable"
import { TopicsTable } from "@/components/table/TopicsTable"
import { EditTeamModal } from "@/components/team/EditTeamModal"
import { InviteUserToTeamButton } from "@/components/team/InviteUserToTeamButton"
import { NewTopicButton, useNewTopicDialog } from "@/components/topic/TopicEditorChoiceDialog"
import { useLoadInBrowser } from "@/hooks/useBrowserValue"
import { usePageTitle } from "@/hooks/usePageTitle"
import { toCountLabel } from "@/lib/labels"
import { CARD_CLASS, PAGE_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { openNewTopicChat, useRegisterChatContext } from "@/stores/chatPanelStore"
import { useAllChatMentions } from "@/stores/chatRoomStore"
import { useAllNoteBadges } from "@/stores/noteBadgeStore"
import { type PageActionOption, useRegisterPageActions } from "@/stores/pageActionsStore"

// editing the profile and starting a team are both owner actions
function toProfileActionOptions({
	isOwnProfile,
	onEditProfile,
	onNewTeam,
}: {
	isOwnProfile: boolean
	onEditProfile: () => void
	onNewTeam: () => void
}): PageActionOption[] {
	return isOwnProfile
		? [
				{ label: "Edit profile", Icon: Pencil, onSelect: onEditProfile },
				{ label: "New team", Icon: Plus, onSelect: onNewTeam },
			]
		: []
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
	const { data: session } = authClient.useSession()
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
	const handleLoadTopics = useCallback(async (): Promise<void> => {
		setTopics((await fetchActivity()).topics)
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
	const profileTeamIds = useMemo(
		() =>
			(profileTeamStatuses ?? [])
				.filter((profileTeamStatus) => profileTeamStatus.status === "member")
				.map((profileTeamStatus) => profileTeamStatus.teamId),
		[profileTeamStatuses],
	)
	useRegisterChatContext(
		profile
			? {
					topicId: null,
					teamId: null,
					name: profile.username,
					joinTeam: null,
					pageTeamIds: isOwnProfile ? [] : profileTeamIds,
					preferredChatRoomKind: "topic",
				}
			: null,
	)

	// this page's action menu options
	useRegisterPageActions(
		profile && session
			? {
					page: "Profile",
					options: toProfileActionOptions({
						isOwnProfile,
						onEditProfile: () => setIsEditingProfile(true),
						onNewTeam: () => void handleOpenNewTeamModal(),
					}),
					report: { subjectKind: "profile", subjectId: profile.userId, subjectLabel: profile.username },
					hasNewTopicButton: isOwnProfile,
				}
			: null,
	)

	// load the topics that the New team modal offers, then open the modal
	const handleOpenNewTeamModal = async (): Promise<void> => {
		setAddableTopics(await fetchAddableTopics())
		setIsNewTeamModalOpen(true)
	}

	// load the profile, except while hydrating the profile the server loaded
	const reloadProfilePage = useCallback((): void => {
		// a failed profile load shows the missing page
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
		return <CoffeeLoading />
	}

	// send a visitor to the sign-up page, or open the New team modal with the profile user invited
	const handleInviteUserToTeam = (): void => {
		if (!session) {
			void navigate({ to: "/signup", search: { cta: "profile-team-up" } })
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
function ProfileSections({
	profile,
	isOwnProfile,
	topics,
	onLoadTopics,
	onReloadProfile,
}: {
	profile: ProfileResponse
	isOwnProfile: boolean
	topics: OwnerTopic[] | null
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
						{/* your own profile manages the topics. other users see the profile table */}
						{isOwnProfile ? (
							topics === null ? (
								<CoffeeLoading className="min-h-0 justify-start py-2 text-sm" />
							) : topics.length === 0 ? (
								<div className={cn(CARD_CLASS, "mb-4")}>
									<button
										type="button"
										onClick={() => openNewTopicChat()}
										className="font-display text-link text-lg hover:underline"
									>
										Give Carl a topic. You know the one.
									</button>
								</div>
							) : (
								<OwnerTopicsTable topics={topics} onReloadPage={onLoadTopics} />
							)
						) : (
							<TopicsTable topics={profile.topics} includesNonPublicTopics={profile.includesNonPublicTopics} />
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
	const { data: session } = authClient.useSession()
	// the unread chat mentions and note changes the user has, across topics and teams, summed on the avatar badge
	const chatMentions = useAllChatMentions()
	const noteBadges = useAllNoteBadges()
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
								chatMentions={chatMentions}
								noteBadges={noteBadges}
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
				Joined {joinDateLabel} · {profile.subscriberCount.toLocaleString()} followers
			</p>
		</header>
	)
}
