import type { TeamPageResponse } from "@shared/contracts"
import { Pencil, Plus, Share2, Trash2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { authClient } from "@/clients/authClient"
import type { TeamPageResult } from "@/clients/teamClient"
import { fetchTeamPage, sendDeleteTeam, sendRemoveTopicFromTeam, sendTeamAvatar } from "@/clients/teamClient"
import { fetchAddableTopics } from "@/clients/topicClient"
import { AVATAR_REJECTIONS } from "@/components/avatar/AvatarUpload"
import { TeamAvatarPicker } from "@/components/avatar/TeamAvatarPicker"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { InviteMembersModal } from "@/components/invite/InviteMembersModal"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"
import { Button, buttonVariants } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { ShareTeam } from "@/components/share/ShareTeam"
import { TableCard } from "@/components/table/TableCard"
import { TeamMembersTable } from "@/components/table/TeamMembersTable"
import { TopicsTable } from "@/components/table/TopicsTable"
import { EditTeamModal } from "@/components/team/EditTeamModal"
import { JoinTeamButton } from "@/components/team/JoinTeamButton"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { TopicMentionBadge } from "@/components/topic/TopicMentionBadge"
import { refreshAvatars } from "@/hooks/useAvatarVersion"
import { usePageTitle } from "@/hooks/usePageTitle"
import { toCountLabel } from "@/lib/labels"
import { PAGE_CLASS } from "@/lib/styleClasses"
import { type ChatPageContext, setChatId, setChatPanelState, useRegisterChatContext } from "@/stores/chatPanelStore"
import { useRegisterPageActions } from "@/stores/pageActionsStore"

// what the shell's chat panel opens on while a team page is up
function toTeamChatContext(viewedTeam: TeamPageResponse | null): ChatPageContext | null {
	if (!viewedTeam) {
		return null
	}
	const joinTeam =
		viewedTeam.role === null
			? {
					teamId: viewedTeam.teamId,
					name: viewedTeam.name,
					hasAvatar: viewedTeam.hasAvatar,
					hasRequestedToJoin: viewedTeam.hasRequestedToJoin,
				}
			: null
	// naming the team marks its own room and its topics' rooms, which all carry its team id
	return {
		topicId: null,
		teamId: viewedTeam.teamId,
		name: viewedTeam.name,
		joinTeam,
		pageTeamIds: [viewedTeam.teamId],
	}
}

/**
 * The team page: the profile template pointed at a team. The members, the profile page's topic
 * table, and for a leader the membership, attachment, and visibility controls.
 */
export function TeamPage() {
	const { teamId } = useParams()
	const { data: session } = authClient.useSession()
	const [teamResult, setTeamResult] = useState<TeamPageResult | undefined>(undefined)
	const [isEditing, setIsEditing] = useState(false)
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
	const [isInviting, setIsInviting] = useState(false)
	const navigate = useNavigate()
	const [isNewTopicOpen, setIsNewTopicOpen] = useState(false)
	// which team has already been offered the way to fill itself
	const offeredTeamIdRef = useRef<string | null>(null)
	const [isSharing, setIsSharing] = useState(false)
	usePageTitle(teamResult?.status === "visible" ? teamResult.team.name : null)

	// the search bar's menu includes this page's rows while the team is on screen
	const viewedTeam = teamResult?.status === "visible" ? teamResult.team : null
	useRegisterPageActions(
		viewedTeam && session
			? {
					page: "Team",
					options: [
						// sharing sits directly above editing, the order the topic page's menu uses
						{ label: "Share team", Icon: Share2, onSelect: () => setIsSharing(true) },
						...(viewedTeam.role === "leader"
							? [
									{ label: "Edit team", Icon: Pencil, onSelect: () => void handleEditOpen() },
									{ label: "Delete team", Icon: Trash2, onSelect: () => setIsConfirmingDelete(true) },
								]
							: []),
					],
					report: { subjectKind: "team", subjectId: viewedTeam.teamId, subjectLabel: viewedTeam.name },
				}
			: null,
	)
	// what the shell's chat panel opens on while this team is on screen
	useRegisterChatContext(toTeamChatContext(viewedTeam))
	// the topics the user may bring, offered beside the team's in the edit modal's combobox
	const [addableTopics, setAddableTopics] = useState<{ id: string; name: string }[]>([])

	// fetch the team page result, which says whether the team is visible, gated to this user, or missing
	const reloadTeam = useCallback((): void => {
		fetchTeamPage(teamId ?? "")
			.then(setTeamResult)
			.catch(() => setTeamResult({ status: "missing" }))
	}, [teamId])
	useEffect(() => reloadTeam(), [reloadTeam])

	// a team with no topics cannot do anything yet
	useEffect(() => {
		if (!viewedTeam || viewedTeam.role === null || viewedTeam.topics.length > 0) {
			return
		}
		if (offeredTeamIdRef.current === viewedTeam.teamId) {
			return
		}
		offeredTeamIdRef.current = viewedTeam.teamId
		fetchAddableTopics(viewedTeam.teamId)
			.then((topics) => {
				setAddableTopics(topics)
				// a user with nothing to bring is asked for a new topic instead of an empty combobox
				if (topics.length > 0) {
					setIsEditing(true)
				} else {
					setIsNewTopicOpen(true)
				}
			})
			.catch(() => setIsNewTopicOpen(true))
	}, [viewedTeam])

	// opening the editor first gathers the topics the user may bring for its combobox
	const handleEditOpen = async (): Promise<void> => {
		setAddableTopics(await fetchAddableTopics(teamId))
		setIsEditing(true)
	}

	// loading, then the gate for a private team, then the missing shape for no team at all
	if (teamResult === undefined) {
		return <CoffeeLoading />
	}
	if (teamResult.status === "gated") {
		return (
			<main className={PAGE_CLASS}>
				<TeamSkeleton teamName={teamResult.teamName} />
				<TeamGateNotice
					teamId={teamId ?? ""}
					teamName={teamResult.teamName}
					isSignedIn={Boolean(session)}
					hasRequested={teamResult.hasRequestedToJoin}
					onChanged={reloadTeam}
				/>
			</main>
		)
	}
	if (teamResult.status === "missing") {
		return (
			<main className={PAGE_CLASS}>
				<p className="text-muted-foreground text-sm">{"Carl couldn't find this team. He checked twice."}</p>
			</main>
		)
	}
	const teamPage = teamResult.team

	return (
		<main className={PAGE_CLASS}>
			<TeamHeader
				teamPage={teamPage}
				isSignedIn={Boolean(session)}
				onChanged={reloadTeam}
				onInviteOpen={() => setIsInviting(true)}
				onOpenChat={() => {
					setChatId({ kind: "room", teamId: teamPage.teamId, topicId: null })
					setChatPanelState("open")
				}}
			/>
			<TeamSections teamPage={teamPage} onNewTopicOpen={() => setIsNewTopicOpen(true)} onChanged={reloadTeam} />
			{isSharing && (
				<ShareTeam
					teamId={teamPage.teamId}
					teamName={teamPage.name}
					isPublic={teamPage.isPublic}
					canInvite={teamPage.role !== null}
					onClose={() => setIsSharing(false)}
				/>
			)}
			<TeamDialogs
				teamPage={teamPage}
				addableTopics={addableTopics}
				isEditing={isEditing}
				isNewTopicOpen={isNewTopicOpen}
				isInviting={isInviting}
				onCloseEdit={() => setIsEditing(false)}
				onCloseNewTopic={() => setIsNewTopicOpen(false)}
				onCloseInvite={() => setIsInviting(false)}
				onChanged={reloadTeam}
				onNewTopicSaved={(topicId) => {
					setIsNewTopicOpen(false)
					navigate(`/topics/${topicId}`)
				}}
			/>
			{isConfirmingDelete && (
				<ConfirmDialog
					title="Delete this team?"
					confirmLabel="Delete team"
					cancelLabel="Keep it"
					onConfirm={() =>
						void sendDeleteTeam(teamPage.teamId).then(() => {
							toast(`Deleted ${teamPage.name}.`)
							navigate("/teams")
						})
					}
					onClose={() => setIsConfirmingDelete(false)}
				>
					{"Its topics return to whoever made them, and the room closes with it."}
				</ConfirmDialog>
			)}
		</main>
	)
}

// the dialogs the header opens, each mounted only while open so its state resets every time
function TeamDialogs({
	teamPage,
	addableTopics,
	isEditing,
	isNewTopicOpen,
	isInviting,
	onCloseEdit,
	onCloseNewTopic,
	onCloseInvite,
	onChanged,
	onNewTopicSaved,
}: {
	teamPage: TeamPageResponse
	addableTopics: { id: string; name: string }[]
	isEditing: boolean
	isNewTopicOpen: boolean
	isInviting: boolean
	onCloseEdit: () => void
	onCloseNewTopic: () => void
	onCloseInvite: () => void
	onChanged: () => void
	// a new topic opens on its own page, where its sources are set up
	onNewTopicSaved: (topicId: string) => void
}) {
	return (
		<>
			{/* the shared team modal, in its edit shape */}
			{isEditing && (
				<EditTeamModal
					team={{
						teamId: teamPage.teamId,
						name: teamPage.name,
						description: teamPage.description,
						hasAvatar: teamPage.hasAvatar,
						isPublic: teamPage.isPublic,
					}}
					currentTopics={teamPage.topics.map((teamTopic) => ({ id: teamTopic.id, name: teamTopic.name }))}
					userTopics={addableTopics}
					onClose={() => onCloseEdit()}
					onSaveTeam={onChanged}
				/>
			)}
			{/* a new topic starts on this team and opens on its own page, the way every other new topic does */}
			{isNewTopicOpen && (
				<EditTopicModal
					initialTeam={{ teamId: teamPage.teamId, name: teamPage.name }}
					onClose={() => onCloseNewTopic()}
					onTopicSaved={async (topicId) => onNewTopicSaved(topicId)}
				/>
			)}
			{/* a member's invite dialog, the team form's invite fields on their own */}
			{isInviting && (
				<InviteMembersModal teamId={teamPage.teamId} teamName={teamPage.name} onClose={() => onCloseInvite()} />
			)}
		</>
	)
}

// the two sections, each an accordion holding a table
function TeamSections({
	teamPage,
	onNewTopicOpen,
	onChanged,
}: {
	teamPage: TeamPageResponse
	onNewTopicOpen: () => void
	onChanged: () => void
}) {
	const isLeader = teamPage.role === "leader"
	return (
		<div className="mt-2">
			<Accordion type="multiple" defaultValue={["members", "topics"]}>
				<AccordionItem value="members">
					<AccordionTrigger className="font-semibold">Team members</AccordionTrigger>
					<AccordionContent>
						<TableCard className="mb-2">
							<TeamMembersTable
								teamId={teamPage.teamId}
								members={teamPage.members}
								hiddenMemberCount={teamPage.hiddenMemberCount}
								isLeader={isLeader}
								onChanged={onChanged}
							/>
						</TableCard>
						{/* the page never appears smaller than the team is */}
						{teamPage.hiddenMemberCount > 0 && (
							<p className="text-muted-foreground pb-2 pl-4 text-xs">
								{`and ${teamPage.hiddenMemberCount} more member${teamPage.hiddenMemberCount === 1 ? "" : "s"}`}
							</p>
						)}
					</AccordionContent>
				</AccordionItem>

				{/* the topics in the same table the profile page renders, plus the leader's Active column */}
				<AccordionItem value="topics">
					<div className="flex items-center gap-2 [&>:first-child]:flex-1">
						<AccordionTrigger className="font-semibold">Team topics</AccordionTrigger>
						{teamPage.role !== null && (
							<Button className="shrink-0" onClick={onNewTopicOpen}>
								<Plus className="size-4" />
								Add Topic
							</Button>
						)}
					</div>
					<AccordionContent>
						{teamPage.topics.length === 0 ? (
							<TableCard className="mb-2">
								<p className="text-muted-foreground py-2 text-sm">No topics on this team yet.</p>
							</TableCard>
						) : (
							<TopicsTable
								topics={teamPage.topics}
								includesNonPublicTopics={teamPage.role !== null}
								topicTooltip="Topics on this team"
								onRemoveTopic={
									isLeader
										? (topic) => void sendRemoveTopicFromTeam(teamPage.teamId, topic.id).then(onChanged)
										: undefined
								}
							/>
						)}
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</div>
	)
}

// the page's shape while it is gated
function TeamSkeleton({ teamName }: { teamName: string }) {
	return (
		<>
			<header className="flex items-center gap-4">
				<div aria-hidden="true" className="bg-muted size-16 shrink-0 animate-pulse rounded-full" />
				<h1 className="font-display text-2xl">{teamName}</h1>
			</header>
			{/* everything below the name is decorative pulse, hidden from assistive tech as one block */}
			<div aria-hidden="true" className="mt-6 space-y-4">
				{TEAM_SKELETON_ROWS.map((skeletonKey) => (
					<div key={skeletonKey} className="bg-muted h-10 w-full animate-pulse rounded" />
				))}
			</div>
		</>
	)
}

// what a user outside a private team is told, and how they get in: asking to join, or an invitation
function TeamGateNotice({
	teamId,
	teamName,
	isSignedIn,
	hasRequested,
	onChanged,
}: {
	teamId: string
	teamName: string
	isSignedIn: boolean
	hasRequested: boolean
	onChanged: () => void
}) {
	const navigate = useNavigate()
	return (
		<Dialog open onOpenChange={() => navigate("/")}>
			{/* the gate's own actions are the only ways out, so there is no ✕ */}
			<DialogContent className="sm:max-w-md" hideCloseButton>
				<DialogTitle>This team is invite-only</DialogTitle>
				<DialogDescription>
					{isSignedIn
						? `Ask to join and a leader of ${teamName} can add you, or they can send you an invitation.`
						: `Sign up, then ask a leader of ${teamName} for an invitation.`}
				</DialogDescription>
				<DialogFooter>
					{isSignedIn && (
						<JoinTeamButton
							teamId={teamId}
							teamName={teamName}
							hasJoinRequest={hasRequested}
							isSignedIn
							onChangeRequest={onChanged}
						/>
					)}
					{!isSignedIn && (
						<AnchorLink href="/signup?cta=team-gate" className={buttonVariants({ variant: "default" })}>
							Sign up
						</AnchorLink>
					)}
					<Button variant="outline" onClick={() => navigate("/")}>
						Back to topics
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// the leader's avatar picker in the header, uploading a chosen or dropped image at once
function TeamHeaderAvatar({
	team,
	onChanged,
}: {
	team: { teamId: string; name: string; hasAvatar: boolean }
	onChanged: () => void
}) {
	const [isUploading, setIsUploading] = useState(false)

	// upload at once. success re-fetches every rendered copy, and a rejection reads as a toast
	const handleAvatarChange = async (avatarFile: File): Promise<void> => {
		setIsUploading(true)
		const rejection = await sendTeamAvatar(team.teamId, avatarFile).finally(() => setIsUploading(false))
		if (rejection) {
			toast.error(AVATAR_REJECTIONS[rejection] ?? "That image didn't reach Carl. Try again.")
			return
		}

		// the rendered avatars refetch under a fresh version
		refreshAvatars()
		onChanged()
	}

	return (
		<TeamAvatarPicker
			team={team}
			onAvatarChange={(avatarFile) => void handleAvatarChange(avatarFile)}
			isDisabled={isUploading}
			className="size-16"
		/>
	)
}

// the decorative rows the gated page draws where its tables would be
const TEAM_SKELETON_ROWS = ["members", "topics", "footer"]

// the identity header: the avatar, the name, and an outsider's join control
function TeamHeader({
	teamPage,
	isSignedIn,
	onChanged,
	onInviteOpen,
	onOpenChat,
}: {
	teamPage: TeamPageResponse
	isSignedIn: boolean
	onChanged: () => void
	onInviteOpen: () => void
	// the mention badge's click opens the page's room panel
	onOpenChat: () => void
}) {
	const isLeader = teamPage.role === "leader"
	return (
		<header>
			<div className="flex items-center gap-4">
				{isLeader ? (
					<TeamHeaderAvatar team={teamPage} onChanged={onChanged} />
				) : (
					<TeamAvatar team={teamPage} className="size-16" />
				)}
				<span className="relative inline-block">
					<h1 className="font-display text-2xl">{teamPage.name}</h1>
					{/* the team room's unseen mentions. the badge's click opens the room, which clears it */}
					<TopicMentionBadge
						topicId={null}
						teamId={teamPage.teamId}
						href={`/teams/${teamPage.teamId}`}
						onClick={(event) => {
							// the click opens the room in place instead of re-navigating to the page
							event.preventDefault()
							onOpenChat()
						}}
					/>
				</span>
				{/* the right column, the join or add button aligned with the avatar's top */}
				<div className="ml-auto flex flex-col items-end gap-1 self-start">
					{teamPage.role === null && (
						<JoinTeamButton
							teamId={teamPage.teamId}
							teamName={teamPage.name}
							hasJoinRequest={teamPage.hasRequestedToJoin}
							isSignedIn={isSignedIn}
							onChangeRequest={onChanged}
						/>
					)}
					{teamPage.role !== null && (
						<Button className="shrink-0" onClick={onInviteOpen}>
							<Plus className="size-4" />
							Add Member
						</Button>
					)}
				</div>
			</div>
			<p className="text-muted-foreground mt-2 text-sm">
				{/* activated members alone, so a waiting request never inflates the headline */}
				{toCountLabel(
					teamPage.members.filter((member) => member.isActive).length + teamPage.hiddenMemberCount,
					"member",
				)}{" "}
				· {toCountLabel(teamPage.topics.length, "topic")}
			</p>
			{teamPage.description && <p className="mt-2 text-sm">{teamPage.description}</p>}
		</header>
	)
}
