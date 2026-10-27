import type { TeamIdentity } from "@carlnotes/contracts/teams"
import { TeamFields } from "@carlnotes/core/components/TeamFields"
import { useTeamFields } from "@carlnotes/core/hooks/useTeamFields"
import { useNavigate } from "@tanstack/react-router"
import { Users } from "lucide-react"
import { useId, useRef, useState } from "react"
import { toast } from "sonner"
import { TeamAvatarPicker } from "@/components/avatar/TeamAvatarPicker"
import { FieldLabel } from "@/components/common/FieldLabel"
import { MultiCombobox } from "@/components/common/MultiCombobox"
import { type PendingInvite, TeamInviteFields } from "@/components/invite/TeamInviteFields"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { createTeamForInviteLink, saveTeam } from "@/components/team/saveTeam"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { useObjectUrl } from "@/hooks/useObjectUrl"
import { TEAM_FIELD_ELEMENTS } from "./TeamFields"

// a topic the multiselect offers: the user's own, a public one, or an invite topic they can read
type TopicOption = { id: string; name: string }

// the team being edited or absent while one is being created
type EditedTeam = Pick<TeamIdentity, "teamId" | "name" | "avatarVersion"> & {
	description: string | null
	isPublic: boolean
}

/**
 * The modal for creating and for editing a team.
 */
export function EditTeamModal({
	team,
	currentTopics,
	userTopics,
	initialTopicIds,
	initialInvites,
	onClose,
	onSaveTeam,
}: {
	// the team being edited. absent creates one instead
	team?: EditedTeam
	// the topics the team has today and ones they can choose from
	currentTopics?: TopicOption[]
	userTopics?: TopicOption[]
	// the topics checked when the modal opens including one passed in
	initialTopicIds?: string[]
	// the invitations staged when the modal opens for the person it was opened from
	initialInvites?: PendingInvite[]
	onClose: () => void
	onSaveTeam?: () => void
}) {
	const navigate = useNavigate()
	// the editable fields, held beside the payload a save writes from them
	const {
		name,
		setName,
		nameRejection,
		checkName,
		description,
		setDescription,
		isPublic,
		setIsPublic,
		selectedTopicIds,
		setSelectedTopicIds,
		pendingInvites,
		setPendingInvites,
		avatarFile,
		setAvatarFile,
		savedFields,
	} = useTeamFields<File>({ team, currentTopics, initialTopicIds, initialInvites })
	// the team the invite-link button created. the modal edits that team instead of creating a second one on Save
	const [createdTeam, setCreatedTeam] = useState<EditedTeam | null>(null)
	const savedTopicIds = useRef((currentTopics ?? []).map((topic) => topic.id))
	const editedTeam = team ?? createdTeam ?? undefined
	// the topics made from the picker's New topic row
	const [isNewTopicOpen, setIsNewTopicOpen] = useState(false)
	const [createdTopics, setCreatedTopics] = useState<TopicOption[]>([])

	// the name is what someone opens this to change, so it takes the focus the dialog hands out
	const dialogRef = useRef<HTMLDivElement>(null)
	// the ids that tie each field label to its field
	const topicsComboboxId = useId()

	// set by a save click that found the name empty
	const [wasNameMissed, setWasNameMissed] = useState(false)
	const [rejection, setRejection] = useState<string | null>(null)
	const [isSaving, setIsSaving] = useState(false)

	// the invite-link button needs a team to point a token at, so the team is saved before sending invites
	const handleCreateTeam = async (): Promise<string | null> => {
		if (editedTeam) {
			return editedTeam.teamId
		}
		if (!name.trim()) {
			setRejection("Name the team before making a link to it.")
			return null
		}
		const createdTeamResult = await createTeamForInviteLink(savedFields)
		if ("rejection" in createdTeamResult) {
			setRejection(createdTeamResult.rejection)
			return null
		}
		setCreatedTeam({ teamId: createdTeamResult.teamId, name, avatarVersion: null, description, isPublic })
		return createdTeamResult.teamId
	}

	// saving creates or updates and uploads the selected image, or reports a rejection reason
	const handleSaveTeam = async (): Promise<void> => {
		// a missing name stops the save
		if (!name.trim()) {
			setWasNameMissed(true)
			dialogRef.current?.querySelector<HTMLInputElement>('[aria-label="Name"]')?.focus()
			toast.error("Please give the team a name.")
			return
		}
		setIsSaving(true)
		setRejection(null)
		try {
			const saveRejection = await saveTeam({
				team: editedTeam,
				fields: savedFields,
				currentTopicIds: savedTopicIds.current,
				pendingInvites,
				onInviteAccepted: (acceptedInvite) =>
					setPendingInvites((invites) => invites.filter((invite) => invite !== acceptedInvite)),
				avatarFile,
				onTeamCreated: (teamId) => setCreatedTeam({ teamId, name, avatarVersion: null, description, isPublic }),
				onTopicsSaved: (ids) => {
					savedTopicIds.current = ids
				},
				onTeamSaved: (savedTeam) => navigate({ to: "/teams/$teamId", params: { teamId: savedTeam.teamId } }),
			})
			if (saveRejection) {
				setRejection(saveRejection)
				return
			}
			// a team the invite-link button already made still opens its page. this save is the end of creating it
			if (createdTeam) {
				navigate({ to: "/teams/$teamId", params: { teamId: createdTeam.teamId } })
			}
			onSaveTeam?.()
			onClose()
		} catch (error) {
			console.error("team save failed", error)
			setRejection(error instanceof Error ? error.message : "That didn't save. Try again.")
		} finally {
			setIsSaving(false)
		}
	}

	// what the topic select shows: the team's own topics, the user's topics, and any created topics from the team modal
	const topicOptions = [...(currentTopics ?? []), ...(userTopics ?? []), ...createdTopics]

	// a topic made from the picker joins the list of selected topics
	const handleTopicCreated = async (topicId: string, topicName: string): Promise<void> => {
		setCreatedTopics([...createdTopics, { id: topicId, name: topicName }])
		setSelectedTopicIds([...selectedTopicIds, topicId])
		setIsNewTopicOpen(false)
	}

	// leaving the field checks the name so a taken one shows early. the save checks again, and that is what rejects it
	const handleNameBlur = (): void => {
		void checkName(editedTeam?.name)
	}

	return (
		<Dialog open onOpenChange={onClose}>
			<DialogContent
				ref={dialogRef}
				className="sm:max-w-md"
				onOpenAutoFocus={(event) => {
					// the avatar's file input is the first thing focusable here
					event.preventDefault()
					dialogRef.current?.querySelector<HTMLInputElement>('[aria-label="Name"]')?.focus()
				}}
			>
				<DialogTitle className="flex items-center gap-2">
					<Users className="size-5" />
					{team ? "Edit team" : "New team"}
				</DialogTitle>
				<TeamFields
					elements={TEAM_FIELD_ELEMENTS}
					isNew={!team}
					name={name}
					description={description}
					isPublic={isPublic}
					onNameChange={setName}
					onDescriptionChange={setDescription}
					onPublicChange={setIsPublic}
					onNameBlur={handleNameBlur}
					hasNameError={(wasNameMissed && !name.trim()) || Boolean(nameRejection)}
					avatar={
						<TeamImagePicker team={editedTeam} name={name} avatarFile={avatarFile} onAvatarChange={setAvatarFile} />
					}
					topics={
						<div>
							<FieldLabel htmlFor={topicsComboboxId}>Topics</FieldLabel>
							<MultiCombobox
								id={topicsComboboxId}
								options={topicOptions.map((topic) => ({ value: topic.id, label: topic.name }))}
								values={selectedTopicIds}
								onUpdateValues={setSelectedTopicIds}
								placeholder="pick topics…"
								emptyLabel="No topics to add yet."
								newOptionLabel="New topic"
								onNewOption={() => setIsNewTopicOpen(true)}
							/>
						</div>
					}
					invitations={
						<TeamInviteFields
							teamId={editedTeam?.teamId ?? null}
							onCreateTeam={handleCreateTeam}
							teamName={name}
							pendingInvites={pendingInvites}
							onPendingInvitesChange={setPendingInvites}
						/>
					}
				/>
				{/* a save rejection, shown in place */}
				{(rejection || nameRejection) && <p className="text-destructive text-sm">{rejection ?? nameRejection}</p>}
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button onClick={() => void handleSaveTeam()} disabled={isSaving}>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
			{/* the new topic modal, opened from the picker's New topic row, and stacked over the team modal */}
			{isNewTopicOpen && (
				<EditTopicModal
					initialTeam={editedTeam ? { teamId: editedTeam.teamId, name: name.trim() || editedTeam.name } : undefined}
					onClose={() => setIsNewTopicOpen(false)}
					onTopicSaved={handleTopicCreated}
				/>
			)}
		</Dialog>
	)
}

// show the selected image over the team's saved avatar
function TeamImagePicker({
	team: editedTeam,
	name,
	avatarFile,
	onAvatarChange,
}: {
	team?: EditedTeam
	name: string
	avatarFile: File | null
	onAvatarChange: (file: File) => void
}) {
	// the avatar the team shows: the file just uploaded, otherwise whatever the team has today
	const previewTeam = { teamId: editedTeam?.teamId ?? "", name: name || "Team", avatarVersion: null }
	const avatarUrl = useObjectUrl(avatarFile)
	const storedAvatarUrl = editedTeam?.avatarVersion
		? `/api/team-avatars/${editedTeam.teamId}?v=${editedTeam.avatarVersion}`
		: null
	const previewAvatarUrl = avatarUrl ?? storedAvatarUrl

	return (
		<TeamAvatarPicker
			team={previewTeam}
			previewUrl={previewAvatarUrl}
			onAvatarChange={onAvatarChange}
			className="size-14"
		/>
	)
}
