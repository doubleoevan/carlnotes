import type { OwnerTopic, ProfileResponse } from "@shared/contracts"
import { Pencil, Plus, Users, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { fetchActivity } from "@/clients/activityClient"
import { authClient } from "@/clients/authClient"
import { fetchProfile, fetchTeamOptions, type TeamMenuOption } from "@/clients/profileClient"
import { sendDeleteTeamInvite, sendRemoveTeamMember } from "@/clients/teamClient"
import { fetchAddableTopics, sendUserInvite } from "@/clients/topicClient"
import { EditProfileModal } from "@/components/account/EditProfileModal"
import { UserAvatarPicker } from "@/components/avatar/UserAvatarPicker"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { CountPill } from "@/components/common/CountPill"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"
import { Button } from "@/components/primitives/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { OwnerTopicsTable } from "@/components/table/OwnerTopicsTable"
import { TeamsMembershipTable } from "@/components/table/TeamsMembershipTable"
import { TopicsTable } from "@/components/table/TopicsTable"
import { EditTeamModal } from "@/components/team/EditTeamModal"
import { NewTeamOption, TeamOption } from "@/components/team/TeamUpButton"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { ChatMentionCount, toChatLabel, toNoteLabel } from "@/components/topic/TopicMentionBadge"
import { usePageTitle } from "@/hooks/usePageTitle"
import { toCountLabel } from "@/lib/labels"
import { CARD_CLASS, MENU_OPTION_CLASS, PAGE_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { useRegisterChatContext } from "@/stores/chatPanelStore"
import { useAllChatMentions } from "@/stores/chatRoomStore"
import { useAllNoteCount } from "@/stores/noteBadgeStore"
import { type PageActionOption, useRegisterPageActions } from "@/stores/pageActionsStore"

// editing the profile and starting a team are both owner actions
function toProfileActionOptions(
	isOwnProfile: boolean,
	onEditProfile: () => void,
	onNewTeam: () => void,
): PageActionOption[] {
	return isOwnProfile
		? [
				{ label: "Edit profile", Icon: Pencil, onSelect: onEditProfile },
				{ label: "New team", Icon: Plus, onSelect: onNewTeam },
			]
		: []
}

/**
 * A user's public profile: their avatar, username, subscriber count, when they joined, and their public Topics,
 * with the owner's non-public topics only shown to the owner or an admin.
 */
export function ProfilePage() {
	const { userId } = useParams<{ userId: string }>()
	const navigate = useNavigate()
	const { data: session } = authClient.useSession()
	const [profile, setProfile] = useState<ProfileResponse | null>(null)
	const [isProfileMissing, setIsProfileMissing] = useState(false)
	const [isNewTopicOpen, setIsNewTopicOpen] = useState(false)
	const [isEditingProfile, setIsEditingProfile] = useState(false)
	const [isTeamingUp, setIsTeamingUp] = useState(false)
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
		if (userId) {
			setProfile(await fetchProfile(userId))
		}
	}, [userId])

	// load a user's own topics
	useEffect(() => {
		if (isOwnProfile) {
			handleLoadTopics().catch((error) => console.error("own topics load failed", error))
		}
	}, [isOwnProfile, handleLoadTopics])

	// load the profile user's teams
	const [teamOptions, setTeamOptions] = useState<TeamMenuOption[] | null>(null)
	const handleLoadTeams = useCallback((): void => {
		if (userId) {
			fetchTeamOptions(userId)
				.then(setTeamOptions)
				.catch(() => setTeamOptions([]))
		}
	}, [userId])
	useEffect(() => handleLoadTeams(), [handleLoadTeams])

	// the teams shared with this profile for the chat context
	const profileTeamIds = useMemo(
		() => (teamOptions ?? []).filter((team) => team.status === "member").map((team) => team.teamId),
		[teamOptions],
	)
	useRegisterChatContext(
		profile
			? {
					topicId: null,
					teamId: null,
					name: profile.username,
					joinTeam: null,
					pageTeamIds: isOwnProfile ? [] : profileTeamIds,
					preferredRoomKind: "topic",
				}
			: null,
	)

	// this page's action menu options
	useRegisterPageActions(
		profile && session
			? {
					page: "Profile",
					options: toProfileActionOptions(
						isOwnProfile,
						() => setIsEditingProfile(true),
						() => void handleOpenTeamUpMenu(),
					),
					report: { subjectKind: "profile", subjectId: profile.userId, subjectLabel: profile.username },
				}
			: null,
	)

	// the team up menu loads its topic multiselect on open
	const handleOpenTeamUpMenu = async (): Promise<void> => {
		setAddableTopics(await fetchAddableTopics())
		setIsTeamingUp(true)
	}

	// load the profile
	useEffect(() => {
		if (!userId) {
			return
		}
		// a failed profile load shows the missing page
		fetchProfile(userId)
			.then((profile) => (profile ? setProfile(profile) : setIsProfileMissing(true)))
			.catch((error) => {
				console.error("profile load failed", error)
				setIsProfileMissing(true)
			})
	}, [userId])

	// close the new topic modal and forward to the topic page
	const handleTopicCreated = async (topicId: string): Promise<void> => {
		setIsNewTopicOpen(false)
		navigate(`/topics/${topicId}`)
	}

	// show the missing page or the loading page
	if (isProfileMissing) {
		return <main className={PAGE_CLASS}>No one here by that name.</main>
	}
	if (!profile) {
		return <CoffeeLoading />
	}

	// a logged-out visitor goes to the sign-up page, and a user on their own profile does not open the team up menu
	const handleTeamUp = (): void => {
		if (!session) {
			navigate("/signup?cta=profile-team-up")
			return
		}
		if (isOwnProfile) {
			return
		}
		void handleOpenTeamUpMenu()
	}

	return (
		<main className={PAGE_CLASS}>
			{/* the profile owner can create a topic but not team up. a different user can team up with this profile user */}
			<ProfileHeader
				profile={profile}
				teamOptions={teamOptions}
				onLoadTeams={handleLoadTeams}
				onNewTopic={session?.user.id === profile.userId ? () => setIsNewTopicOpen(true) : undefined}
				onTeamUp={session?.user.id === profile.userId ? undefined : handleTeamUp}
			/>
			{isEditingProfile && (
				<EditProfileModal
					userId={profile.userId}
					username={profile.username}
					onClose={() => setIsEditingProfile(false)}
					onUsernameChanged={handleReloadProfile}
				/>
			)}
			{isTeamingUp && (
				<EditTeamModal
					userTopics={addableTopics}
					initialInvites={isOwnProfile ? [] : [{ username: profile.username }]}
					onClose={() => setIsTeamingUp(false)}
				/>
			)}
			<ProfileSections
				profile={profile}
				topics={topics}
				isOwnProfile={isOwnProfile}
				onLoadTopics={handleLoadTopics}
				onNewTopic={() => setIsNewTopicOpen(true)}
				onReloadProfile={handleReloadProfile}
			/>
			{isNewTopicOpen && <EditTopicModal onClose={() => setIsNewTopicOpen(false)} onTopicSaved={handleTopicCreated} />}
		</main>
	)
}

// the topics and teams sections. each is an accordion item containing a table
function ProfileSections({
	profile,
	isOwnProfile,
	topics,
	onLoadTopics,
	onNewTopic,
	onReloadProfile,
}: {
	profile: ProfileResponse
	isOwnProfile: boolean
	topics: OwnerTopic[] | null
	onLoadTopics: () => void
	onNewTopic: () => void
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
									<button type="button" onClick={onNewTopic} className="font-display text-link text-lg hover:underline">
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
								onLeave={() => navigate("/teams")}
								onDelete={() => navigate("/teams")}
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
	onTeamUp,
	teamOptions,
	onLoadTeams,
}: {
	profile: ProfileResponse
	onNewTopic?: () => void
	onTeamUp?: () => void
	teamOptions: TeamMenuOption[] | null
	onLoadTeams: () => void
}) {
	const { data: session } = authClient.useSession()
	// unread chat mentions, for the avatar badge
	const chatMentions = useAllChatMentions()
	// every unread note change the user has, across topics and teams, for the avatar badge
	const noteChangeCount = useAllNoteCount()
	// the join month and year label
	const joinDateLabel = new Date(profile.joinedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })

	const isOwnProfile = session?.user.id === profile.userId
	return (
		<header>
			<div className="flex items-center gap-4">
				{isOwnProfile ? (
					<>
						{/* the user avatar with its unread chat mention and note badges */}
						<span className="relative inline-block">
							<UserAvatarPicker userId={profile.userId} username={profile.username} className="size-16" />
							{(noteChangeCount > 0 || chatMentions.length > 0) && (
								<span className="pointer-events-none absolute -top-1 -right-1 flex items-center gap-1">
									{/* the filled chat mentions badge next to the outline note changes badge */}
									{chatMentions.length > 0 && (
										<span role="status" aria-label={toChatLabel(chatMentions)}>
											<ChatMentionCount
												chatMentions={chatMentions}
												className="bg-card text-card-foreground h-5 min-w-5 border text-xs"
											/>
										</span>
									)}
									{noteChangeCount > 0 && (
										<span role="status" aria-label={toNoteLabel(noteChangeCount)}>
											<CountPill count={noteChangeCount} variant="outline" className="h-5 min-w-5 text-xs" />
										</span>
									)}
								</span>
							)}
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
							avatarSource={profile.avatarSource}
							className="size-16"
						/>
						<h1 className="font-display text-2xl">{profile.username}</h1>
					</>
				)}
				{/* the right column: the owner's New Topic button on top. a different user sees the Team Up button. */}
				<div className="ml-auto flex flex-col items-end gap-1 self-start">
					{onNewTopic && (
						<Button className="shrink-0" onClick={onNewTopic}>
							<Plus className="size-4" />
							New Topic
						</Button>
					)}
					{onTeamUp &&
						(session ? (
							<ProfileTeamUpButton
								userId={profile.userId}
								username={profile.username}
								teams={teamOptions}
								onReload={onLoadTeams}
								onCreateTeam={onTeamUp}
							/>
						) : (
							<Button className="shrink-0" onClick={onTeamUp}>
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

// every team the user belongs to with the action each team member status allows
function ProfileTeamUpButton({
	userId,
	username,
	teams,
	onReload,
	onCreateTeam,
}: {
	userId: string
	username: string
	teams: TeamMenuOption[] | null
	onReload: () => void
	onCreateTeam: () => void
}) {
	const [isOpen, setIsOpen] = useState(false)

	// the rows refetch on open
	const handleOpenChange = (isOpening: boolean): void => {
		setIsOpen(isOpening)
		if (isOpening) {
			onReload()
		}
	}

	// the Team Up button icon fills if a team has this profile user or their pending invite
	const isTeamMember = (teams ?? []).some((team) => team.status !== "none")

	// send the username an invitation to that team
	const handleInviteTeamMember = async (teamMenuOption: TeamMenuOption): Promise<void> => {
		const refusal = await sendUserInvite({ teamId: teamMenuOption.teamId }, { username })
		if (refusal) {
			toast.error(`The invitation to @${username} didn't go through.`)
		} else {
			toast(`Invited @${username} to ${teamMenuOption.name}.`)
		}
		onReload()
	}

	// a team leader removes a team member, unless they are removing themself and the team has only one leader
	const handleRemoveTeamMember = async (teamMenuOption: TeamMenuOption): Promise<void> => {
		if (await sendRemoveTeamMember(teamMenuOption.teamId, userId)) {
			toast(`Removed @${username} from ${teamMenuOption.name}.`)
		} else {
			toast.error("A team must have at least one leader.")
		}
		onReload()
	}

	// delete the pending team invitation
	const handleDeleteTeamInvite = async (teamMenuOption: TeamMenuOption): Promise<void> => {
		if (teamMenuOption.inviteId) {
			await sendDeleteTeamInvite(teamMenuOption.teamId, teamMenuOption.inviteId)
			toast("Team invitation removed.")
		}
		onReload()
	}

	return (
		<Popover open={isOpen} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button className="shrink-0">
					<Users className={cn("size-4", isTeamMember && "fill-current")} />
					Team Up
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-64" bodyClassName="p-1">
				{/* the user's teams, each menu option shaped by this profile's status there */}
				{teams === null && <CoffeeLoading className="min-h-0 justify-start px-2 py-2 text-sm" />}
				{(teams ?? []).map((team) =>
					team.status === "none" ? (
						<TeamOption key={team.teamId} team={team} onSelect={() => void handleInviteTeamMember(team)} />
					) : (
						<div key={team.teamId} className="flex items-center">
							<span className={cn(MENU_OPTION_CLASS, "hover:bg-transparent min-w-0 flex-1")}>
								<TeamAvatar team={team} className="size-5" />
								<span className="truncate">{team.name}</span>
							</span>
							{team.status === "member" ? (
								<RemoveTeamMemberButton
									team={team}
									username={username}
									onRemove={() => void handleRemoveTeamMember(team)}
								/>
							) : team.canDeleteInvite ? (
								<Tooltip>
									<TooltipTrigger asChild>
										<button
											type="button"
											onClick={() => void handleDeleteTeamInvite(team)}
											aria-label={`Delete invitation to ${team.name}`}
											className="text-muted-foreground hover:text-foreground rounded-md p-2"
										>
											<X className="size-4" />
										</button>
									</TooltipTrigger>
									<TooltipContent>
										Delete invitation to <span className="font-semibold">{team.name}</span>
									</TooltipContent>
								</Tooltip>
							) : (
								<Tooltip>
									<TooltipTrigger asChild>
										{/* a disabled button swallows hover, so the tooltip hangs on the wrapping span */}
										<span className="rounded-md p-2">
											<X className="text-muted-foreground size-4 opacity-50" />
										</span>
									</TooltipTrigger>
									<TooltipContent>Must be a leader to delete another member&apos;s invitation</TooltipContent>
								</Tooltip>
							)}
						</div>
					),
				)}
				{/* the new team option, under a divider when teams are listed */}
				{teams !== null && teams.length > 0 && <div className="bg-border my-1 h-px" />}
				{teams !== null && (
					<NewTeamOption
						onCreate={() => {
							setIsOpen(false)
							onCreateTeam()
						}}
					/>
				)}
			</PopoverContent>
		</Popover>
	)
}

// the X on a team this profile belongs to, disabled with the reason for anyone but the team's leader
function RemoveTeamMemberButton({
	team,
	username,
	onRemove,
}: {
	team: TeamMenuOption
	username: string
	onRemove: () => void
}) {
	if (team.role !== "leader") {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					{/* a disabled button swallows hover, so the tooltip hangs on the wrapping span */}
					<span className="rounded-md p-2">
						<X className="text-muted-foreground size-4 opacity-50" />
					</span>
				</TooltipTrigger>
				<TooltipContent>
					{"Must be a leader to remove "}
					<span className="font-semibold">{username}</span>
					{" from "}
					<span className="font-semibold">{team.name}</span>
				</TooltipContent>
			</Tooltip>
		)
	}
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={onRemove}
					aria-label={`Remove ${username} from ${team.name}`}
					className="text-muted-foreground hover:text-foreground rounded-md p-2"
				>
					<X className="size-4" />
				</button>
			</TooltipTrigger>
			<TooltipContent>
				{"Remove "}
				<span className="font-semibold">{username}</span>
				{" from "}
				<span className="font-semibold">{team.name}</span>
			</TooltipContent>
		</Tooltip>
	)
}
