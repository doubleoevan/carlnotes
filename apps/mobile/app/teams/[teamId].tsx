import { authClient } from "@carlnotes/client/authClient"
import { fetchTeamPage, sendDeleteTeam } from "@carlnotes/client/teamClient"
import { isLeaderRole } from "@carlnotes/contracts/enums"
import { toTeamPath } from "@carlnotes/contracts/seo"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { sendTeamViewOnce } from "@carlnotes/core/lib/pageViews"
import { ADD_TEAM_MEMBER_LABEL } from "@carlnotes/core/lib/teamFields"
import { useQuery } from "@tanstack/react-query"
import { router, useFocusEffect, useLocalSearchParams, usePathname } from "expo-router"
import { Pencil, Plus, Share as ShareIcon, Trash2 } from "lucide-react-native"
import { useCallback, useState } from "react"
import { Alert, View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { LoadFailedNotice } from "@/components/common/LoadFailedNotice"
import { ViewerCountLine } from "@/components/common/ViewerCountLine"
import { InviteMembersModal } from "@/components/invite/InviteMembersModal"
import { PageScreen } from "@/components/layout/PageScreen"
import { PageSkeleton } from "@/components/layout/PageSkeleton"
import { NotesSection } from "@/components/note/NotesSection"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { ShareTeam } from "@/components/share/ShareTeam"
import { AddTopicButton } from "@/components/team/AddTopicButton"
import { EditTeamModal } from "@/components/team/EditTeamModal"
import { JoinTeamButton } from "@/components/team/JoinTeamButton"
import { TeamHeader } from "@/components/team/TeamHeader"
import { TeamSections } from "@/components/team/TeamSections"
import { NewTopicDialog } from "@/components/topic/TopicEditorChoiceSheet"
import { NewTopicButton } from "@/components/topic/TopicHomeActions"
import { usePageMutation } from "@/hooks/usePageMutation"
import {
	PLAIN_PAGE_BUTTON_CLASS,
	PLAIN_PAGE_BUTTON_ICON_CLASS,
	PLAIN_PAGE_BUTTON_TEXT_CLASS,
} from "@/pageButtonClasses"

/**
 * Shows a team and its permitted membership and topic controls.
 */
export default function TeamScreen() {
	// load the team for the current account and track its open dialog
	const { teamId } = useLocalSearchParams<{ teamId: string }>()
	const { data: session } = authClient().useSession()
	const [dialog, setDialog] = useState<"edit" | "invite" | "share" | "new-topic" | null>(null)
	// how many notes the notes section lists once they load, for the header's details line
	const [noteCount, setNoteCount] = useState<number | null>(null)
	const query = useQuery({ queryKey: ["team", session?.user.id, teamId], queryFn: () => fetchTeamPage(teamId) })
	const handleReload = (): void => {
		void query.refetch()
	}
	const mutation = usePageMutation(handleReload)
	const team = query.data?.status === "visible" ? query.data.team : null
	const isTeamLeader = isLeaderRole(team?.role)

	// count a team page the user may open once per app runtime, as the web counts it once per tab
	const viewedTeamId = team?.teamId
	useFocusEffect(
		useCallback(() => {
			if (viewedTeamId) {
				sendTeamViewOnce(viewedTeamId)
			}
		}, [viewedTeamId]),
	)
	function handleDelete(): void {
		Alert.alert(
			"Delete this team?",
			"Its topics return to whoever made them, and the room closes with it. A team with other members survives without you under a new leader.",
			[
				{ text: "Keep it", style: "cancel" },
				{
					text: "Delete team",
					style: "destructive",
					onPress: () =>
						void mutation.run(async () => {
							// delete or hand over the team before returning to the team list
							const deleteTeamResult = await sendDeleteTeam(teamId)
							if (!deleteTeamResult) {
								throw new Error("That team didn't get deleted. Try again.")
							}
							if (deleteTeamResult.status === "handedOver") {
								Alert.alert(`@${deleteTeamResult.newLeaderUsername} leads it now.`)
							}
							router.replace("/teams")
						}),
				},
			],
		)
	}
	return (
		<PageScreen
			hasNewTopicButton={isTeamLeader}
			title={team?.name ?? "Team"}
			contentClassName={query.isPending ? "mt-0 gap-0" : "mt-2 gap-0"}
			onRefresh={handleReload}
			isRefreshing={query.isRefetching}
			report={team ? { subjectKind: "team", subjectId: teamId, subjectLabel: team.name } : undefined}
			options={
				team
					? [
							{ label: "Share team", icon: ShareIcon, onSelect: () => setDialog("share") },
							...(isTeamLeader
								? [
										{ label: "Edit team", icon: Pencil, onSelect: () => setDialog("edit") },
										{ label: "Delete team", icon: Trash2, onSelect: handleDelete },
									]
								: []),
						]
					: []
			}
			header={
				query.isPending ? false : team && <TeamHeader teamPage={team} noteCount={noteCount} onReload={handleReload} />
			}
			// a member adds a member and anyone else joins, in the plain style
			leftButton={
				team &&
				(team.role ? (
					<Button
						variant="outline"
						className={PLAIN_PAGE_BUTTON_CLASS}
						accessibilityLabel={ADD_TEAM_MEMBER_LABEL}
						onPress={() => setDialog("invite")}
					>
						<Icon as={Plus} className={PLAIN_PAGE_BUTTON_ICON_CLASS} />
						<Text className={PLAIN_PAGE_BUTTON_TEXT_CLASS}>{ADD_TEAM_MEMBER_LABEL}</Text>
					</Button>
				) : (
					<JoinTeamButton {...team} isHighlighted={false} onChanged={handleReload} />
				))
			}
			// only a leader may attach a topic here or start one on the team
			topicButton={
				team &&
				(isTeamLeader ? (
					<AddTopicButton teamId={teamId} onTopicAdded={handleReload} onNewTopic={() => setDialog("new-topic")} />
				) : (
					<NewTopicButton />
				))
			}
		>
			<TeamContent query={query} teamId={teamId} onReload={handleReload} onNoteCountChange={setNoteCount} />
			{mutation.error && <Text className="text-destructive">{mutation.error}</Text>}
			{team && <TeamDialogs team={team} dialog={dialog} onClose={() => setDialog(null)} onReload={handleReload} />}
		</PageScreen>
	)
}

// route each menu action to its existing native form
function TeamDialogs({
	team,
	dialog,
	onClose,
	onReload,
}: {
	team: TeamPageResponse
	dialog: "edit" | "invite" | "share" | "new-topic" | null
	onClose: () => void
	onReload: () => void
}) {
	const { teamId } = team
	return (
		<>
			{team && dialog === "edit" && (
				<EditTeamModal team={team} currentTopics={team.topics} onClose={() => onClose()} onSaved={onReload} />
			)}
			{team && dialog === "invite" && (
				<InviteMembersModal teamId={teamId} teamName={team.name} onClose={() => onClose()} onChanged={onReload} />
			)}
			{team && dialog === "share" && (
				<ShareTeam
					teamId={teamId}
					teamName={team.name}
					isPublic={team.isPublic}
					canInvite={Boolean(team.role)}
					onClose={() => onClose()}
				/>
			)}
			{team && dialog === "new-topic" && (
				<NewTopicDialog
					initialTeam={{ teamId: team.teamId, name: team.name }}
					onClose={() => onClose()}
					onTopicSaved={(id) => {
						onReload()
						router.push(`/topics/${id}`)
					}}
				/>
			)}
		</>
	)
}

// keep the readable, gated, and unavailable team states in one place
function TeamContent({
	query,
	teamId,
	onReload,
	onNoteCountChange,
}: {
	query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchTeamPage>>>>
	teamId: string
	onReload: () => void
	onNoteCountChange: (noteCount: number | null) => void
}) {
	const team = query.data?.status === "visible" ? query.data.team : null
	const pathname = usePathname()
	if (query.isPending) {
		return <PageSkeleton kind="team" />
	}
	if (query.data?.status === "gated") {
		return (
			<View className="gap-4">
				<Text className="font-display text-xl">This team is invite-only</Text>
				<Text>{`Ask to join and a leader of ${query.data.teamName} can add you, or they can send you an invite.`}</Text>
				<JoinTeamButton
					teamId={teamId}
					name={query.data.teamName}
					hasRequestedToJoin={query.data.hasRequestedToJoin}
					onChanged={onReload}
				/>
				<AnchorLink href="/" accessibilityLabel="Back to topics">
					<Text className="text-link">Back to topics</Text>
				</AnchorLink>
			</View>
		)
	}
	if (!team) {
		return query.error ? (
			<LoadFailedNotice message="Team didn't load." retryLabel="Retry loading team" onRetry={onReload} />
		) : (
			<Text>Carl couldn't find this team. He checked twice.</Text>
		)
	}
	return (
		<>
			<TeamSections
				teamPage={team}
				onReload={onReload}
				notesSection={<NotesSection pageType="team" pageId={teamId} onNoteCountChange={onNoteCountChange} />}
			/>
			{/* the team's visitors, read while this team is the active route */}
			<ViewerCountLine
				viewerCountPage={{ kind: "team", id: teamId, isPublic: team.isPublic }}
				isActiveRoute={pathname === toTeamPath(teamId)}
			/>
		</>
	)
}
