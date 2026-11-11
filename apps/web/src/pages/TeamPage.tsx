import { authClient } from "@carlnotes/client/authClient"
import type { TeamPageResult } from "@carlnotes/client/teamClient"
import { fetchTeamPage, sendDeleteTeam, sendRemoveTopicFromTeam } from "@carlnotes/client/teamClient"
import { fetchAddableTopics } from "@carlnotes/client/topicClient"
import { isLeaderRole } from "@carlnotes/contracts/enums"
import { type TeamPageResponse, toTeamPageTitle } from "@carlnotes/contracts/teams"
import { TEAM_SECTION_VALUES, TEAM_SECTIONS } from "@carlnotes/core/lib/cardSections"
import { toSectionCountLabel } from "@carlnotes/core/lib/labels"
import { sendTeamViewOnce } from "@carlnotes/core/lib/pageViews"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { Pencil, Share, Trash2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { AccordionSection } from "@/components/common/AccordionSection"
import { PagedCardsSection } from "@/components/common/CardsSection"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { ViewerCountLine } from "@/components/common/ViewerCountLine"
import { PageSkeleton } from "@/components/layout/PageSkeleton"
import { NotesSection } from "@/components/note/NotesSection"
import { PodcastEpisodeCard } from "@/components/podcast/PodcastEpisodeCard"
import { Accordion } from "@/components/primitives/accordion"
import { ShareTeam } from "@/components/share/ShareTeam"
import { EmptyListCard, TableCard } from "@/components/table/TableCard"
import { TeamMembersTable } from "@/components/table/TeamMembersTable"
import { TopicsTable } from "@/components/table/TopicsTable"
import { AddTopicButton } from "@/components/team/AddTopicButton"
import { type TeamDialog, TeamDialogs } from "@/components/team/TeamDialogs"
import { TeamGateNotice, TeamSkeleton } from "@/components/team/TeamGate"
import { TeamHeader } from "@/components/team/TeamHeader"
import { TopicCard } from "@/components/topic/TopicCard"
import { NewTopicButton, useNewTopicDialog } from "@/components/topic/TopicEditorChoiceDialog"
import { TopicPostCard } from "@/components/topicPost/TopicPostCard"
import { useLoadInBrowser } from "@/hooks/useBrowserValue"
import { usePageTitle } from "@/hooks/usePageTitle"
import { PAGE_CLASS } from "@/lib/styleClasses"
import { type ChatPageContext, setChatId, setChatPanelState, useRegisterChatContext } from "@/stores/chatPanelStore"
import { useRegisterPageActions } from "@/stores/pageActionsStore"

// what the shell's chat panel opens on while a team page is up
function toTeamChatContext(viewedTeam: TeamPageResponse | null): ChatPageContext | null {
	if (!viewedTeam) {
		return null
	}
	// a non-member gets the join button
	const joinTeam = viewedTeam.role
		? null
		: {
				teamId: viewedTeam.teamId,
				name: viewedTeam.name,
				avatarVersion: viewedTeam.avatarVersion,
				hasRequestedToJoin: viewedTeam.hasRequestedToJoin,
			}
	// naming the team marks its own chat room and its topics' chat rooms, which all have its team id
	return {
		topicId: null,
		teamId: viewedTeam.teamId,
		name: viewedTeam.name,
		joinTeam,
		pageTeamIds: [viewedTeam.teamId],
	}
}

// the team route, whose loader reads the team on the server
const teamRoute = getRouteApi("/_layout/teams/$teamId")

/**
 * The team page: the profile template pointed at a team. The members, the profile page's topic
 * table, and for a leader the membership, attachment, and visibility controls.
 */
export function TeamPage() {
	const { teamId } = teamRoute.useParams()
	const { data: session } = authClient().useSession()
	// the team page result, and its reload after a change
	const { teamResult, reloadTeam } = useTeamPageResult(teamId)
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
	const navigate = useNavigate()
	// the one modal on screen, or null when none is open
	const [openDialog, setOpenDialog] = useState<TeamDialog | null>(null)
	// which team has already been offered the way to fill itself
	const teamIdRef = useRef<string | null>(null)
	const [isSharing, setIsSharing] = useState(false)
	// how many notes the notes section lists once they load, for the header's details line
	const [noteCount, setNoteCount] = useState<number | null>(null)
	// the New Topic button of everyone but a leader, who adds a topic to the team
	const { openNewTopicDialog, newTopicDialog } = useNewTopicDialog()
	usePageTitle(teamResult?.status === "visible" ? toTeamPageTitle(teamResult.team.name) : null)

	// the search bar's menu includes this page's options while the team is on screen
	const viewedTeam = teamResult?.status === "visible" ? teamResult.team : null
	useRegisterPageActions(
		viewedTeam && session
			? {
					page: "Team",
					options: [
						// sharing sits directly above editing, the order the topic page's menu uses
						{ label: "Share team", Icon: Share, onSelect: () => setIsSharing(true) },
						...(isLeaderRole(viewedTeam.role)
							? [
									{ label: "Edit team", Icon: Pencil, onSelect: () => setOpenDialog("edit") },
									{ label: "Delete team", Icon: Trash2, onSelect: () => setIsConfirmingDelete(true) },
								]
							: []),
					],
					report: { subjectKind: "team", subjectId: viewedTeam.teamId, subjectLabel: viewedTeam.name },
					// a leader gets the team topics' Add Topic button
					hasNewTopicButton: isLeaderRole(viewedTeam.role),
				}
			: null,
	)
	// what the shell's chat panel opens on while this team is on screen
	useRegisterChatContext(toTeamChatContext(viewedTeam))

	// send the team page's view once per tab, once the page the user may open has loaded
	const viewedTeamId = viewedTeam?.teamId
	useEffect(() => {
		if (viewedTeamId === teamId) {
			sendTeamViewOnce(teamId)
		}
	}, [teamId, viewedTeamId])
	// the topics the user may bring, offered beside the team's in the edit modal's combobox
	const [addableTopics, setAddableTopics] = useState<{ id: string; name: string }[]>([])

	// a leader's first visit to a team with no topics opens the edit team dialog
	const openEditTeamDialog = useCallback((team: TeamPageResponse, teamDialog: TeamDialog): void => {
		if (!isLeaderRole(team.role) || team.topics.length > 0 || teamIdRef.current === team.teamId) {
			return
		}
		teamIdRef.current = team.teamId
		setOpenDialog(teamDialog)
	}, [])

	// the topics a leader may add, reread whenever the team reloads
	useEffect(() => {
		if (!viewedTeam || !isLeaderRole(viewedTeam.role)) {
			setAddableTopics([])
			return
		}
		let isCurrent = true
		fetchAddableTopics(viewedTeam.teamId)
			.then((topics) => {
				if (!isCurrent) {
					return
				}
				setAddableTopics(topics)
				openEditTeamDialog(viewedTeam, topics.length > 0 ? "edit" : "new-topic")
			})
			.catch(() => isCurrent && openEditTeamDialog(viewedTeam, "new-topic"))
		return () => {
			isCurrent = false
		}
	}, [viewedTeam, openEditTeamDialog])

	// show the loading animation, then the gate for a private team, or the missing shape for no team at all
	if (teamResult === undefined) {
		return (
			<main className={PAGE_CLASS}>
				<PageSkeleton kind="team" />
			</main>
		)
	}
	if (teamResult.status === "gated") {
		return (
			<main className={PAGE_CLASS}>
				<TeamSkeleton teamName={teamResult.teamName} />
				<TeamGateNotice
					teamId={teamId}
					teamName={teamResult.teamName}
					isSignedIn={Boolean(session)}
					hasRequestedToJoin={teamResult.hasRequestedToJoin}
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

	// deleting leaves the page. a team with other members survives under a new leader, named in the toast
	const handleDeleteTeam = async (): Promise<void> => {
		const deleteTeamResult = await sendDeleteTeam(teamPage.teamId)
		if (!deleteTeamResult) {
			toast.error("That team didn't get deleted. Try again.")
			setIsConfirmingDelete(false)
			return
		}
		if (deleteTeamResult.status === "handedOver") {
			toast(`You left ${teamPage.name}. @${deleteTeamResult.newLeaderUsername} leads it now.`)
		} else {
			toast(`Deleted ${teamPage.name}.`)
		}
		void navigate({ to: "/teams" })
	}

	return (
		<main className={PAGE_CLASS}>
			<TeamHeader
				teamPage={teamPage}
				noteCount={noteCount}
				isSignedIn={Boolean(session)}
				onChanged={reloadTeam}
				onInviteOpen={() => setOpenDialog("invite")}
				onOpenChat={() => {
					setChatId({ kind: "room", teamId: teamPage.teamId, topicId: null })
					setChatPanelState("open")
				}}
				topicButton={
					// only a leader may attach a topic here or start one on the team
					isLeaderRole(teamPage.role) ? (
						<AddTopicButton
							teamId={teamPage.teamId}
							addableTopics={addableTopics}
							onTopicAdded={reloadTeam}
							onNewTopic={() => setOpenDialog("new-topic")}
						/>
					) : (
						<NewTopicButton onNewTopic={openNewTopicDialog} />
					)
				}
			/>
			{newTopicDialog}
			{/* every section open by default, and the accordion holds the state for all of them */}
			<div className="mt-2">
				<Accordion type="multiple" defaultValue={[...TEAM_SECTION_VALUES, "members", "topics", "notes"]}>
					{/* the team's topics and their films, podcast episodes, and Topic Posts as cards, the films right before
					    the podcast episodes, each hidden while it has none */}
					<PagedCardsSection
						section={TEAM_SECTIONS.topicCards}
						rows={teamPage.topicCards}
						renderCard={(topic) => <TopicCard topic={topic} />}
					/>
					<PagedCardsSection
						section={TEAM_SECTIONS.topicPodcastEpisodeVideoCards}
						rows={teamPage.topicPodcastEpisodeVideoCards ?? []}
						renderCard={(podcastEpisodeCard) => (
							<PodcastEpisodeCard podcastEpisodeCard={podcastEpisodeCard} variant="video" videoSurface="team-videos" />
						)}
					/>
					<PagedCardsSection
						section={TEAM_SECTIONS.podcastEpisodeCards}
						rows={teamPage.podcastEpisodeCards}
						renderCard={(podcastEpisodeCard) => <PodcastEpisodeCard podcastEpisodeCard={podcastEpisodeCard} />}
					/>
					<PagedCardsSection
						section={TEAM_SECTIONS.topicPostCards}
						rows={teamPage.topicPostCards}
						renderCard={(topicPost) => <TopicPostCard topicPost={topicPost} />}
					/>
					<TeamMembersSection teamPage={teamPage} onChanged={reloadTeam} />
					<TeamTopicsSection teamPage={teamPage} onChanged={reloadTeam} />
					{/* the team notes are the last section in the accordion */}
					<NotesSection
						pageType="team"
						pageId={teamPage.teamId}
						titleClassName="font-display text-xl"
						isInsideAccordion
						onNoteCountChange={setNoteCount}
					/>
				</Accordion>
			</div>
			{/* the team page's visitors, as its last line */}
			<ViewerCountLine viewerCountPage={{ kind: "team", id: teamPage.teamId, isPublic: teamPage.isPublic }} />
			{isSharing && (
				<ShareTeam
					teamId={teamPage.teamId}
					teamName={teamPage.name}
					isPublic={teamPage.isPublic}
					canInvite={Boolean(teamPage.role)}
					onClose={() => setIsSharing(false)}
				/>
			)}
			<TeamDialogs
				teamPage={teamPage}
				addableTopics={addableTopics}
				openDialog={openDialog}
				onOpenDialog={setOpenDialog}
				onChanged={reloadTeam}
				onNewTopicSaved={(topicId) => {
					setOpenDialog(null)
					navigate({ to: "/topics/$topicId", params: { topicId } })
				}}
			/>
			{isConfirmingDelete && (
				<ConfirmDialog
					title="Delete this team?"
					confirmLabel="Delete team"
					cancelLabel="Keep it"
					onConfirm={handleDeleteTeam}
					onClose={() => setIsConfirmingDelete(false)}
				>
					{"Its topics return to whoever made them, and the room closes with it."}
				</ConfirmDialog>
			)}
		</main>
	)
}

// the team page result, seeded by the server's read, and its reload
function useTeamPageResult(teamId: string): {
	teamResult: TeamPageResult | undefined
	reloadTeam: () => void
} {
	// the team page result the route loads on the server, or undefined after a browser navigation
	const loadedTeamResult = teamRoute.useLoaderData({ select: (loaderData) => loaderData?.teamResult ?? undefined })
	const [teamResult, setTeamResult] = useState<TeamPageResult | undefined>(loadedTeamResult)

	// fetch the team page result, which says whether the team is visible, gated to this user, or missing
	const reloadTeam = useCallback((): void => {
		fetchTeamPage(teamId)
			.then(setTeamResult)
			.catch(() => setTeamResult({ status: "missing" }))
	}, [teamId])

	// load the team on mount and on a move to another team, except when hydrating a visible or gated team the server
	// rendered. a server read that failed or came back missing still loads
	const isLoadedOnServer = loadedTeamResult?.status === "visible" || loadedTeamResult?.status === "gated"
	useLoadInBrowser({ pageId: teamId, isLoadedOnServer, loadPage: reloadTeam })
	return { teamResult, reloadTeam }
}

/**
 * The team's members, and how many of them chose not to be shown.
 */
function TeamMembersSection({ teamPage, onChanged }: { teamPage: TeamPageResponse; onChanged: () => void }) {
	// the active members, shown or not, as the header counts them
	const memberCount = teamPage.members.filter((member) => member.isActive).length + teamPage.hiddenMemberCount
	return (
		<AccordionSection value="members" title="Team members" countLabel={toSectionCountLabel(memberCount, "member")}>
			<TableCard className="mb-2">
				<TeamMembersTable
					teamId={teamPage.teamId}
					members={teamPage.members}
					hiddenMemberCount={teamPage.hiddenMemberCount}
					isTeamLeader={isLeaderRole(teamPage.role)}
					onChanged={onChanged}
				/>
			</TableCard>
			{/* the page never appears smaller than the team is */}
			{teamPage.hiddenMemberCount > 0 && (
				<p className="text-muted-foreground pb-2 pl-4 text-xs">
					{`and ${teamPage.hiddenMemberCount} more member${teamPage.hiddenMemberCount === 1 ? "" : "s"}`}
				</p>
			)}
		</AccordionSection>
	)
}

/**
 * The team's topics, in the same table the profile page renders, plus the leader's button to remove one.
 */
function TeamTopicsSection({ teamPage, onChanged }: { teamPage: TeamPageResponse; onChanged: () => void }) {
	const isTeamLeader = isLeaderRole(teamPage.role)
	return (
		<AccordionSection
			value="topics"
			title="All Topics"
			countLabel={toSectionCountLabel(teamPage.topics.length, "topic")}
		>
			{teamPage.topics.length === 0 ? (
				<EmptyListCard>No topics on this team yet.</EmptyListCard>
			) : (
				<TopicsTable
					topics={teamPage.topics}
					includesNonPublicTopics={Boolean(teamPage.role)}
					topicTooltip="Topics on this team"
					onRemoveTopic={
						isTeamLeader
							? (topic) => void sendRemoveTopicFromTeam(teamPage.teamId, topic.id).then(onChanged)
							: undefined
					}
				/>
			)}
		</AccordionSection>
	)
}
