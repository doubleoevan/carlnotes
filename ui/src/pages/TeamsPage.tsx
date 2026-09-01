import type { TeamSummary, TeamsPageResponse } from "@shared/contracts"
import { Plus, Users } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { authClient } from "@/clients/authClient"
import { fetchTeams, sendDeleteTeam, sendRemoveTeamMember } from "@/clients/teamClient"
import { fetchAddableTopics } from "@/clients/topicClient"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { CountPill } from "@/components/common/CountPill"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"
import { Button } from "@/components/primitives/button"
import { SentTeamInvitesTable } from "@/components/table/TeamInvitesTable"
import { TeamsMembershipTable } from "@/components/table/TeamsMembershipTable"
import { EditTeamModal } from "@/components/team/EditTeamModal"
import { ChatMentionCount } from "@/components/topic/TopicMentionBadge"
import { usePageTitle } from "@/hooks/usePageTitle"
import { PAGE_CLASS } from "@/lib/styleClasses"
import { useRegisterChatContext } from "@/stores/chatPanelStore"
import { useAllTeamMentions } from "@/stores/chatRoomStore"
import { useAllTeamNoteCount } from "@/stores/noteBadgeStore"

/**
 * The teams page: the teams the user belongs to with their role in each, the New Team button, and the
 * only place to leave a team.
 */
export function TeamsPage() {
	usePageTitle("Teams")
	const { data: session } = authClient.useSession()
	const [teamsPage, setTeamsIndex] = useState<TeamsPageResponse | null>(null)
	// the chat panel's poll feeds this
	const teamMentions = useAllTeamMentions()
	// every unread change on the teams' notes
	const teamNoteCount = useAllTeamNoteCount()
	// the panel leads with a team's own chat room and falls back to a topic's
	useRegisterChatContext({
		topicId: null,
		teamId: null,
		name: "your teams",
		joinTeam: null,
		preferredRoomKind: "team",
	})
	const [isCreating, setIsCreating] = useState(false)
	const [teamToLeave, setTeamToLeave] = useState<TeamSummary | null>(null)
	const [teamToDelete, setTeamToDelete] = useState<TeamSummary | null>(null)
	// the topics the user may bring along, for the create modal's multiselect
	const [addableTopics, setAddableTopics] = useState<{ id: string; name: string }[]>([])

	// every team and invitation, reloaded after every change made from this page
	const reloadTeams = useCallback((): void => {
		fetchTeams()
			.then(setTeamsIndex)
			.catch(() => setTeamsIndex({ teams: [], receivedInvites: [], sentInvites: [] }))
	}, [])
	useEffect(() => reloadTeams(), [reloadTeams])

	// the create modal offers every topic the user may bring: theirs, every public topic, and the invite topics they can read
	const handleCreateOpen = async (): Promise<void> => {
		setAddableTopics(await fetchAddableTopics())
		setIsCreating(true)
	}

	// deleting is confirmed, and the only team they lead is rejected with the reason
	const handleDeleteTeam = async (): Promise<void> => {
		if (!teamToDelete) {
			return
		}
		const isDeleted = await sendDeleteTeam(teamToDelete.teamId)
		if (!isDeleted) {
			toast.error("Create another team before you delete this one.\nYou always lead at least one team.")
		}
		setTeamToDelete(null)
		reloadTeams()
	}

	// leaving is confirmed, and the last leader is rejected with the reason
	const handleLeaveTeam = async (): Promise<void> => {
		if (!teamToLeave || !session) {
			return
		}
		const isRemoved = await sendRemoveTeamMember(teamToLeave.teamId, session.user.id)
		if (!isRemoved) {
			toast.error("Promote another leader first. A team can't be left without one.")
		}
		setTeamToLeave(null)
		reloadTeams()
	}

	return (
		<main className={PAGE_CLASS}>
			{/* the page title with the same icon as its header menu item, and the New Team button to the right */}
			<div className="flex items-center justify-between gap-4">
				<h1 className="font-display flex items-center gap-2 text-2xl">
					<Users className="size-6" />
					Teams
					{/* the unread chat mentions across every chat room, with the note count after them */}
					{teamMentions.length > 0 && <ChatMentionCount chatMentions={teamMentions} className="h-6 min-w-6 text-sm" />}
					{teamNoteCount > 0 && <CountPill count={teamNoteCount} variant="outline" className="h-6 min-w-6 text-sm" />}
				</h1>
				<Button className="shrink-0" onClick={() => void handleCreateOpen()}>
					<Plus className="size-4" />
					New Team
				</Button>
			</div>
			{/* whose teams these are, with a link to their profile */}
			{session && (
				<UserProfileLink
					user={{
						userId: session.user.id,
						username: session.user.username ?? "",
						avatarSource: session.user.avatarSource ?? null,
					}}
					className="mt-2 text-sm"
				/>
			)}
			{/* mt-2 plus the first accordion trigger's own padding matches the account page's mt-6 gap */}
			<div className="mt-2">
				{/* the loading state, then the two accordion sections */}
				{teamsPage === null ? (
					<CoffeeLoading />
				) : (
					<Accordion type="multiple" defaultValue={["teams", "invites"]}>
						{/* the teams the user belongs to. a user with none starts one from here */}
						<AccordionItem value="teams">
							<AccordionTrigger className="font-semibold">Your teams</AccordionTrigger>
							<AccordionContent>
								{teamsPage.teams.length > 0 || teamsPage.receivedInvites.length > 0 ? (
									<TeamsMembershipTable
										teams={teamsPage.teams}
										receivedInvites={teamsPage.receivedInvites}
										onLeave={setTeamToLeave}
										onDelete={setTeamToDelete}
										onAnswered={reloadTeams}
									/>
								) : (
									<p className="text-muted-foreground pb-4 pl-4 text-sm">
										<button type="button" onClick={() => void handleCreateOpen()} className="text-link hover:underline">
											Start a team.
										</button>{" "}
										Carl brews for everyone at once.
									</p>
								)}
							</AccordionContent>
						</AccordionItem>

						{/* the invitations the user sent. a received one is a row of the teams table above */}
						{teamsPage.sentInvites.length > 0 && (
							<AccordionItem value="invites">
								<AccordionTrigger className="font-semibold">Your team invitations</AccordionTrigger>
								<AccordionContent>
									<SentTeamInvitesTable invites={teamsPage.sentInvites} onReload={reloadTeams} />
								</AccordionContent>
							</AccordionItem>
						)}
					</Accordion>
				)}
			</div>
			{/* the shared create modal with invites and the topic multiselect */}
			{isCreating && <EditTeamModal userTopics={addableTopics} onClose={() => setIsCreating(false)} />}
			{/* deleting the team hands every topic back to whoever created it */}
			{teamToDelete && (
				<ConfirmDialog
					title={`Delete ${teamToDelete.name}?`}
					confirmLabel="Delete team"
					cancelLabel="Keep it"
					onConfirm={() => void handleDeleteTeam()}
					onClose={() => setTeamToDelete(null)}
				>
					{`Its ${teamToDelete.topicCount} topic${teamToDelete.topicCount === 1 ? "" : "s"} go back to whoever created them, and the room goes with the team.`}
				</ConfirmDialog>
			)}
			{teamToLeave && (
				<ConfirmDialog
					title="Leave this team?"
					confirmLabel="Leave team"
					cancelLabel="Stay"
					onConfirm={() => void handleLeaveTeam()}
					onClose={() => setTeamToLeave(null)}
				>
					{`You lose access to ${teamToLeave.name}'s topics and its Coffee talk.`}
				</ConfirmDialog>
			)}
		</main>
	)
}
