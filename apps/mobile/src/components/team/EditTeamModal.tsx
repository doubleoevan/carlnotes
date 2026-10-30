import { authClient } from "@carlnotes/client/authClient"
import { sendTeamAvatarBody } from "@carlnotes/client/teamClient"
import { fetchAddableTopics } from "@carlnotes/client/topicClient"
import { createTeamPayload } from "@carlnotes/contracts/payloads"
import { TeamFields } from "@carlnotes/core/components/TeamFields"
import { useTeamFields } from "@carlnotes/core/hooks/useTeamFields"
import { createTeamForInviteLink, saveTeam } from "@carlnotes/core/lib/saveTeam"
import type { EditedTeam, PendingInvite, TopicOption } from "@carlnotes/core/lib/teamFields"
import { sendPendingTeamInvites } from "@carlnotes/core/lib/teamInvites"
import { useQuery } from "@tanstack/react-query"
import { router } from "expo-router"
import { ImagePlus } from "lucide-react-native"
import { useRef, useState } from "react"
import { View } from "react-native"
import { useAvatarPicker } from "@/components/avatar/avatarUpload"
import { MultiCombobox } from "@/components/common/MultiCombobox"
import { Sheet } from "@/components/common/Sheet"
import { TeamInviteFields } from "@/components/invite/TeamInviteFields"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { usePageMutation } from "@/hooks/usePageMutation"
import { TEAM_FIELD_ELEMENTS } from "./TeamFields"

/**
 * Adapts the shared team editor and save flow to the native sheet.
 */
export function EditTeamModal({
	team,
	currentTopics = [],
	initialTopicIds,
	initialInvites,
	onClose,
	onSaved,
}: {
	team?: EditedTeam
	currentTopics?: TopicOption[]
	initialTopicIds?: string[]
	initialInvites?: PendingInvite[]
	onClose: () => void
	onSaved?: (teamId: string) => void
}) {
	// keep a created identity through upload failures so retry cannot create another team
	const { data: session } = authClient().useSession()
	const fields = useTeamFields<FormData>({ team, currentTopics, initialTopicIds, initialInvites })
	const createdTeamId = useRef<string | null>(null)
	const createdTeamName = useRef<string | undefined>(undefined)
	const savedTopicIds = useRef(currentTopics.map((topic) => topic.id))
	const [isNewTopicOpen, setIsNewTopicOpen] = useState(false)
	const [createdTopics, setCreatedTopics] = useState<TopicOption[]>([])
	const mutation = usePageMutation()
	// the picked team image waits for the save, so its copy is kept until the sheet closes
	const teamAvatarPicker = useAvatarPicker({
		onPicked: async (body) => fields.setAvatarFile(body),
		isFileKept: true,
	})

	// combine saved, available, and newly created topic choices
	const topics = useQuery({
		queryKey: ["addable-topics", session?.user.id, team?.teamId],
		queryFn: () => fetchAddableTopics(team?.teamId),
	})
	const topicOptions = [
		...new Map([...currentTopics, ...(topics.data ?? []), ...createdTopics].map((topic) => [topic.id, topic])).values(),
	]
	const editedTeamId = team?.teamId ?? createdTeamId.current
	async function handleCreateForLink(): Promise<string | null> {
		if (team || createdTeamId.current) {
			return team?.teamId ?? createdTeamId.current
		}
		// validate the team fields before creating an invitation target
		const teamFieldsResult = createTeamPayload.safeParse(fields.savedFields)
		if (!teamFieldsResult.success) {
			throw new Error(teamFieldsResult.error.issues[0]?.message ?? "Please name the team.")
		}

		// create the team and retain its identity for later saves
		const createdTeam = await createTeamForInviteLink(teamFieldsResult.data)
		if ("rejection" in createdTeam) {
			throw new Error(createdTeam.rejection)
		}
		createdTeamId.current = createdTeam.teamId
		createdTeamName.current = fields.name
		return createdTeam.teamId
	}
	async function handleSave(): Promise<void> {
		// validate the edited team fields
		const teamFieldsResult = createTeamPayload.safeParse(fields.savedFields)
		if (!teamFieldsResult.success) {
			throw new Error(teamFieldsResult.error.issues[0]?.message ?? "Please check the team fields.")
		}

		// save the team and retain completed steps for a retry
		const teamId = team?.teamId ?? createdTeamId.current
		const rejection = await saveTeam({
			team: teamId ? { teamId } : undefined,
			fields: teamFieldsResult.data,
			currentTopicIds: savedTopicIds.current,
			pendingInvites: fields.pendingInvites,
			avatarFile: fields.avatarFile,
			uploadAvatar: sendTeamAvatarBody,
			onTeamCreated: (id) => {
				createdTeamId.current = id
				createdTeamName.current = fields.name
			},
			onTopicsSaved: (ids) => {
				savedTopicIds.current = ids
			},
			onTeamSaved: () => {},
			sendInvites: (id, invites) =>
				sendPendingTeamInvites({ teamId: id, invites, setPendingInvites: fields.setPendingInvites }),
		})
		if (rejection) {
			throw new Error(rejection)
		}

		// close the editor and open the saved team
		const savedTeamId = teamId ?? createdTeamId.current
		onClose()
		if (savedTeamId) {
			if (onSaved) {
				onSaved(savedTeamId)
			} else {
				router.push(`/teams/${savedTeamId}`)
			}
		}
	}
	return (
		<>
			<Sheet title={team ? "Edit team" : "New team"} onClose={onClose}>
				<View className="gap-4">
					<TeamFields
						elements={TEAM_FIELD_ELEMENTS}
						isNew={!team}
						name={fields.name}
						description={fields.description}
						isPublic={fields.isPublic}
						onNameChange={fields.setName}
						onDescriptionChange={fields.setDescription}
						onPublicChange={fields.setIsPublic}
						onNameBlur={() => void fields.checkName(createdTeamName.current ?? team?.name)}
						hasNameError={Boolean(fields.nameRejection)}
						avatar={
							<>
								<Button
									ref={teamAvatarPicker.triggerRef}
									variant="outline"
									accessibilityLabel="Choose team image"
									disabled={mutation.isPending || teamAvatarPicker.isPicking}
									onPress={teamAvatarPicker.openFilePicker}
								>
									<Icon as={ImagePlus} />
									<Text>{fields.avatarFile ? "Image selected · change" : "Choose team image"}</Text>
								</Button>
								{teamAvatarPicker.filePickerMenu}
							</>
						}
						topics={
							<MultiCombobox
								label="Topics"
								options={topicOptions.map((topic) => ({ value: topic.id, label: topic.name }))}
								values={fields.selectedTopicIds}
								onUpdateValues={fields.setSelectedTopicIds}
								placeholder="Select topics…"
								emptyLabel={topics.isPending ? "Loading…" : "No topics found."}
								onNewOption={() => setIsNewTopicOpen(true)}
							/>
						}
						invitations={
							<TeamInviteFields
								teamId={team?.teamId ?? createdTeamId.current}
								teamName={fields.name}
								pendingInvites={fields.pendingInvites}
								onPendingInvitesChange={fields.setPendingInvites}
								onCreateTeam={handleCreateForLink}
							/>
						}
					/>
					{(fields.nameRejection || mutation.error || topics.error) && (
						<Text className="text-sm text-destructive">
							{fields.nameRejection ?? mutation.error ?? topics.error?.message}
						</Text>
					)}
					<View className="flex-row justify-end gap-2">
						<Button variant="outline" accessibilityLabel="Cancel" onPress={onClose}>
							<Text>Cancel</Text>
						</Button>
						<Button
							accessibilityLabel="Save team"
							disabled={mutation.isPending}
							onPress={() => void mutation.run(handleSave)}
						>
							<Text>{mutation.isPending ? "Saving…" : "Save"}</Text>
						</Button>
					</View>
				</View>
			</Sheet>
			{isNewTopicOpen && (
				<EditTopicModal
					initialTeam={editedTeamId ? { teamId: editedTeamId, name: fields.name } : undefined}
					onClose={() => setIsNewTopicOpen(false)}
					onTopicSaved={(id, name) => {
						setCreatedTopics((currentTopics) => [...currentTopics, { id, name }])
						fields.setSelectedTopicIds([...fields.selectedTopicIds, id])
						void topics.refetch()
					}}
				/>
			)}
		</>
	)
}
