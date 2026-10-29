import { authClient } from "@carlnotes/client/authClient"
import {
	fetchTeamPage,
	sendDeleteTeam,
	sendRemoveTopicFromTeam,
	sendTeamAvatarBody,
} from "@carlnotes/client/teamClient"
import { isLeaderRole } from "@carlnotes/contracts/enums"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { AVATAR_REJECTIONS } from "@carlnotes/core/lib/avatarUpload"
import { toCountLabel } from "@carlnotes/core/lib/labels"
import { useQuery } from "@tanstack/react-query"
import { router, useLocalSearchParams } from "expo-router"
import { Pencil, Plus, Share2, Trash2 } from "lucide-react-native"
import { useState } from "react"
import { Alert, View } from "react-native"
import { chooseAvatarBody } from "@/components/avatar/avatarUpload"
import { Avatar } from "@/components/branding/Avatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PageUpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { InviteMembersModal } from "@/components/invite/InviteMembersModal"
import { PageScreen } from "@/components/layout/PageScreen"
import { PageSkeleton } from "@/components/layout/PageSkeleton"
import { NotesSection } from "@/components/note/NotesSection"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { ShareTeam } from "@/components/share/ShareTeam"
import { TeamMembersTable } from "@/components/table/TeamMembersTable"
import { TopicsTable } from "@/components/table/TopicsTable"
import { AddTopicButton } from "@/components/team/AddTopicButton"
import { EditTeamModal } from "@/components/team/EditTeamModal"
import { JoinTeamButton } from "@/components/team/JoinTeamButton"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { usePageMutation } from "@/hooks/usePageMutation"

/**
 * Shows a team and its permitted membership and topic controls.
 */
export default function TeamScreen() {
	// load the team for the current account and track its open dialog
	const { teamId } = useLocalSearchParams<{ teamId: string }>()
	const { data: session } = authClient().useSession()
	const [dialog, setDialog] = useState<"edit" | "invite" | "share" | "new-topic" | null>(null)
	const query = useQuery({ queryKey: ["team", session?.user.id, teamId], queryFn: () => fetchTeamPage(teamId) })
	const handleReload = (): void => {
		void query.refetch()
	}
	const mutation = usePageMutation(handleReload)
	const team = query.data?.status === "visible" ? query.data.team : null
	const isTeamLeader = isLeaderRole(team?.role)
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
							{ label: "Share team", icon: Share2, onSelect: () => setDialog("share") },
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
				query.isPending
					? false
					: team && <TeamHeader team={team} onInvite={() => setDialog("invite")} onReload={handleReload} />
			}
		>
			<TeamContent query={query} teamId={teamId} onReload={handleReload} onNewTopic={() => setDialog("new-topic")} />
			{mutation.error && <Text className="text-destructive">{mutation.error}</Text>}
			{team && <TeamDialogs team={team} dialog={dialog} onClose={() => setDialog(null)} onReload={handleReload} />}
		</PageScreen>
	)
}

// keep avatar editing separate from the team's tables and dialogs
function TeamHeader({
	team,
	onInvite,
	onReload,
}: {
	team: TeamPageResponse
	onInvite: () => void
	onReload: () => void
}) {
	const { teamId } = team
	const isTeamLeader = isLeaderRole(team.role)
	const mutation = usePageMutation(onReload)
	return (
		<View className="gap-2">
			<View className="flex-row flex-wrap items-center gap-3">
				{isTeamLeader ? (
					<Button
						variant="ghost"
						accessibilityLabel="Change team avatar"
						className="h-auto p-0"
						disabled={mutation.isPending}
						onPress={() =>
							void mutation.run(async () => {
								const body = await chooseAvatarBody()
								if (body) {
									const rejection = await sendTeamAvatarBody(teamId, body)
									if (rejection) {
										throw new Error(AVATAR_REJECTIONS[rejection] ?? "That image didn't reach Carl. Try again.")
									}
								}
							})
						}
					>
						<Avatar
							ownerId={teamId}
							name={team.name}
							imageUrl={team.avatarVersion ? `/api/team-avatars/${teamId}?v=${team.avatarVersion}` : null}
							size={64}
						/>
					</Button>
				) : (
					<Avatar
						ownerId={teamId}
						name={team.name}
						imageUrl={team.avatarVersion ? `/api/team-avatars/${teamId}?v=${team.avatarVersion}` : null}
						size={64}
					/>
				)}
				<Text accessibilityRole="header" className="shrink font-display text-2xl">
					{team.name}
				</Text>
				{/* the team chat room's unseen mentions and the team's note changes. the press opens the chat room */}
				<View className="flex-1">
					<PageUpdateCountBadge topicId={null} teamId={teamId} className="self-start" />
				</View>
				{team.role ? (
					<Button accessibilityLabel="Add member" onPress={() => onInvite()}>
						<Icon as={Plus} className="size-4" />
						<Text>Add member</Text>
					</Button>
				) : (
					<JoinTeamButton {...team} onChanged={onReload} />
				)}
			</View>
			{team.description && <Text className="text-sm text-muted-foreground">{team.description}</Text>}
			<Text className="text-sm text-muted-foreground">
				{toCountLabel(team.members.filter((member) => member.isActive).length + team.hiddenMemberCount, "member")}
				{` · ${toCountLabel(team.topics.length, "topic")}`}
			</Text>
			{mutation.error && <Text className="text-sm text-destructive">{mutation.error}</Text>}
		</View>
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
				<EditTopicModal
					initialTeam={team}
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
	onNewTopic,
}: {
	query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchTeamPage>>>>
	teamId: string
	onReload: () => void
	onNewTopic: () => void
}) {
	const team = query.data?.status === "visible" ? query.data.team : null
	const isTeamLeader = isLeaderRole(team?.role)
	const mutation = usePageMutation(onReload)
	if (query.isPending) {
		return <PageSkeleton kind="team" />
	}
	if (query.data?.status === "gated") {
		return (
			<View className="gap-4">
				<Text className="font-display text-xl">This team is invite-only</Text>
				<Text>{`Ask to join and a leader of ${query.data.teamName} can add you, or they can send you an invitation.`}</Text>
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
		return (
			<Text>
				{query.error ? "Team didn't load. Pull to try again." : "Carl couldn't find this team. He checked twice."}
			</Text>
		)
	}
	return (
		<>
			<CollapsibleSection title="Team members">
				<TeamMembersTable
					teamId={teamId}
					members={team.members}
					hiddenMemberCount={team.hiddenMemberCount}
					isTeamLeader={isTeamLeader}
					onChanged={onReload}
				/>
			</CollapsibleSection>
			<CollapsibleSection
				title="Team topics"
				titleAside={
					isTeamLeader && <AddTopicButton teamId={teamId} onTopicAdded={onReload} onNewTopic={() => onNewTopic()} />
				}
			>
				{team.topics.length ? (
					<TopicsTable
						topics={team.topics}
						includesNonPublicTopics={Boolean(team.role)}
						onRemoveTopic={
							isTeamLeader
								? (topic) =>
										void mutation.run(async () => {
											if (!(await sendRemoveTopicFromTeam(teamId, topic.id))) {
												throw new Error("That topic didn't get removed.")
											}
										})
								: undefined
						}
					/>
				) : (
					<Text className="text-muted-foreground">No topics on this team yet.</Text>
				)}
			</CollapsibleSection>
			<NotesSection pageType="team" pageId={teamId} />
			{mutation.error && <Text className="text-destructive">{mutation.error}</Text>}
		</>
	)
}
