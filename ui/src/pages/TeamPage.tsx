import type { TeamPageResponse } from "@shared/contracts/teams"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { Pencil, Share2, Trash2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { authClient } from "@/clients/authClient"
import type { TeamPageResult } from "@/clients/teamClient"
import { fetchTeamPage, sendDeleteTeam, sendRemoveTopicFromTeam } from "@/clients/teamClient"
import { fetchAddableTopics } from "@/clients/topicClient"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { NotesSection } from "@/components/note/NotesSection"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"
import { ShareTeam } from "@/components/share/ShareTeam"
import { TableCard } from "@/components/table/TableCard"
import { TeamMembersTable } from "@/components/table/TeamMembersTable"
import { TopicsTable } from "@/components/table/TopicsTable"
import { AddTopicButton } from "@/components/team/AddTopicButton"
import { type TeamDialog, TeamDialogs } from "@/components/team/TeamDialogs"
import { TeamGateNotice, TeamSkeleton } from "@/components/team/TeamGate"
import { TeamHeader } from "@/components/team/TeamHeader"
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
	const joinTeam =
		viewedTeam.role === null
			? {
					teamId: viewedTeam.teamId,
					name: viewedTeam.name,
					avatarVersion: viewedTeam.avatarVersion,
					hasRequestedToJoin: viewedTeam.hasRequestedToJoin,
				}
			: null
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
	const { data: session } = authClient.useSession()
	// the team page result, and its reload after a change
	const { teamResult, reloadTeam } = useTeamPageResult(teamId)
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
	const navigate = useNavigate()
	// the one modal on screen, or null when none is open
	const [openDialog, setOpenDialog] = useState<TeamDialog | null>(null)
	// which team has already been offered the way to fill itself
	const teamIdRef = useRef<string | null>(null)
	const [isSharing, setIsSharing] = useState(false)
	usePageTitle(teamResult?.status === "visible" ? teamResult.team.name : null)

	// the search bar's menu includes this page's options while the team is on screen
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
									{ label: "Edit team", Icon: Pencil, onSelect: () => setOpenDialog("edit") },
									{ label: "Delete team", Icon: Trash2, onSelect: () => setIsConfirmingDelete(true) },
								]
							: []),
					],
					report: { subjectKind: "team", subjectId: viewedTeam.teamId, subjectLabel: viewedTeam.name },
					// a leader gets the team topics' Add Topic button
					hasNewTopicButton: viewedTeam.role === "leader",
				}
			: null,
	)
	// what the shell's chat panel opens on while this team is on screen
	useRegisterChatContext(toTeamChatContext(viewedTeam))
	// the topics the user may bring, offered beside the team's in the edit modal's combobox
	const [addableTopics, setAddableTopics] = useState<{ id: string; name: string }[]>([])

	// a leader's first visit to a team with no topics opens the edit team dialog
	const openEditTeamDialog = useCallback((team: TeamPageResponse, teamDialog: TeamDialog): void => {
		if (team.role !== "leader" || team.topics.length > 0 || teamIdRef.current === team.teamId) {
			return
		}
		teamIdRef.current = team.teamId
		setOpenDialog(teamDialog)
	}, [])

	// the topics a leader may add, reread whenever the team reloads
	useEffect(() => {
		if (viewedTeam?.role !== "leader") {
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
		return <CoffeeLoading />
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
				isSignedIn={Boolean(session)}
				onChanged={reloadTeam}
				onInviteOpen={() => setOpenDialog("invite")}
				onOpenChat={() => {
					setChatId({ kind: "room", teamId: teamPage.teamId, topicId: null })
					setChatPanelState("open")
				}}
			/>
			{/* every section open by default, and the accordion holds the state for all of them */}
			<div className="mt-2">
				<Accordion type="multiple" defaultValue={["members", "topics", "notes"]}>
					<TeamMembersSection teamPage={teamPage} onChanged={reloadTeam} />
					<TeamTopicsSection
						teamPage={teamPage}
						addableTopics={addableTopics}
						onNewTopicOpen={() => setOpenDialog("new-topic")}
						onChanged={reloadTeam}
					/>
					{/* the team notes are the last section in the accordion */}
					<NotesSection pageType="team" pageId={teamPage.teamId} titleClassName="font-semibold" isInsideAccordion />
				</Accordion>
			</div>
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
					onConfirm={() => void handleDeleteTeam()}
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
	return (
		<AccordionItem value="members">
			<AccordionTrigger className="font-semibold">Team members</AccordionTrigger>
			<AccordionContent>
				<TableCard className="mb-2">
					<TeamMembersTable
						teamId={teamPage.teamId}
						members={teamPage.members}
						hiddenMemberCount={teamPage.hiddenMemberCount}
						isTeamLeader={teamPage.role === "leader"}
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
	)
}

/**
 * The team's topics, in the same table the profile page renders, plus the leader's button to remove one.
 */
function TeamTopicsSection({
	teamPage,
	addableTopics,
	onNewTopicOpen,
	onChanged,
}: {
	teamPage: TeamPageResponse
	// the user's topics not on this team yet, offered before the create modal
	addableTopics: { id: string; name: string }[]
	onNewTopicOpen: () => void
	onChanged: () => void
}) {
	const isTeamLeader = teamPage.role === "leader"
	return (
		<AccordionItem value="topics">
			<div className="flex items-center gap-2 [&>:first-child]:flex-1">
				<AccordionTrigger className="font-semibold">Team topics</AccordionTrigger>
				{/* only a leader may attach a topic here or start a new one */}
				{isTeamLeader && (
					<AddTopicButton
						teamId={teamPage.teamId}
						addableTopics={addableTopics}
						onTopicAdded={onChanged}
						onNewTopic={onNewTopicOpen}
					/>
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
							isTeamLeader
								? (topic) => void sendRemoveTopicFromTeam(teamPage.teamId, topic.id).then(onChanged)
								: undefined
						}
					/>
				)}
			</AccordionContent>
		</AccordionItem>
	)
}
