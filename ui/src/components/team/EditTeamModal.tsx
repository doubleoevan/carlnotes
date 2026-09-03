import type { TeamIdentity } from "@shared/contracts"
import { Users } from "lucide-react"
import { useRef, useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import {
	type CreateTeamRejection,
	fetchTeamNameTaken,
	sendAddTopicTeam,
	sendCreateTeam,
	sendRemoveTopicFromTeam,
	sendTeamAvatar,
	sendUpdateTeam,
} from "@/clients/teamClient"
import { AVATAR_REJECTIONS } from "@/components/avatar/AvatarUpload"
import { TeamAvatarPicker } from "@/components/avatar/TeamAvatarPicker"
import { FieldLabel } from "@/components/common/FieldLabel"
import { MultiCombobox } from "@/components/common/MultiCombobox"
import { type PendingInvite, sendPendingInvites, TeamInviteFields } from "@/components/invite/TeamInviteFields"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { Input } from "@/components/primitives/input"
import { Switch } from "@/components/primitives/switch"
import { Textarea } from "@/components/primitives/textarea"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { refreshAvatars } from "@/hooks/useAvatarVersion"
import { useObjectUrl } from "@/hooks/useObjectUrl"
import { cn } from "@/lib/utils"

// what each rejection tells the person saving a team
const REJECTION_REASONS: Record<CreateTeamRejection, string> = {
	quota: "You have reached your limit of teams for one day. Try again tomorrow.",
	"name-taken": "A team already has that name. Try another.",
}

// a topic the multiselect offers: the user's own, a public one, or an invite topic they can read
type TopicOption = { id: string; name: string }

// the team being edited or absent while one is being created
type EditedTeam = Pick<TeamIdentity, "teamId" | "name" | "hasAvatar"> & {
	description: string | null
	isPublic: boolean
}

// the editable team fields, seeded from the team being edited or left empty for a new one
function useTeamFields(
	team: EditedTeam | undefined,
	currentTopics: TopicOption[] | undefined,
	initialTopicIds: string[] | undefined,
	initialInvites: PendingInvite[] | undefined,
) {
	const [name, setName] = useState(team?.name ?? "")
	const [description, setDescription] = useState(team?.description ?? "")
	// the team page's visibility
	const [isPublic, setIsPublic] = useState(team?.isPublic ?? false)
	const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>(
		team ? (currentTopics ?? []).map((topic) => topic.id) : (initialTopicIds ?? []),
	)
	// the invitations to send once the team is saved.
	const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>(initialInvites ?? [])
	// the selected image, uploaded once the team is saved
	const [avatarFile, setAvatarFile] = useState<File | null>(null)
	return {
		name,
		setName,
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
		// what a save writes, with an empty description stored as nothing at all
		savedFields: {
			name,
			description: description.trim() === "" ? null : description,
			topicIds: selectedTopicIds,
			isPublic,
		},
	}
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
	} = useTeamFields(team, currentTopics, initialTopicIds, initialInvites)
	// the team the invite-link button created. the modal edits that team instead of creating a second one on Save
	const [createdTeam, setCreatedTeam] = useState<EditedTeam | null>(null)
	const editedTeam = team ?? createdTeam ?? undefined
	// the topics made from the picker's New topic row
	const [isNewTopicOpen, setIsNewTopicOpen] = useState(false)
	const [createdTopics, setCreatedTopics] = useState<TopicOption[]>([])

	// the name is what someone opens this to change, so it takes the focus the dialog hands out
	const nameRef = useRef<HTMLInputElement>(null)

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
		let newTeamId: string | null = null
		const saveRejection = await saveTeam({
			fields: savedFields,
			currentTopicIds: [],
			pendingInvites: [],
			avatarFile: null,
			onTeamSaved: (team) => {
				newTeamId = team.teamId
			},
		})
		if (saveRejection || !newTeamId) {
			setRejection(saveRejection ?? "That team didn't get made. Try again.")
			return null
		}
		setCreatedTeam({ teamId: newTeamId, name, hasAvatar: false, description, isPublic })
		return newTeamId
	}

	// saving creates or updates and uploads the selected image, or reports a rejection reason
	const handleSaveTeam = async (): Promise<void> => {
		// a missing name stops the save
		if (!name.trim()) {
			setWasNameMissed(true)
			nameRef.current?.focus()
			toast.error("Please give the team a name.")
			return
		}
		setIsSaving(true)
		setRejection(null)
		try {
			const saveRejection = await saveTeam({
				team: editedTeam,
				fields: savedFields,
				currentTopicIds: (currentTopics ?? []).map((topic) => topic.id),
				pendingInvites,
				avatarFile,
				onTeamSaved: (savedTeam) => navigate(`/teams/${savedTeam.teamId}`),
			})
			if (saveRejection) {
				setRejection(saveRejection)
				return
			}
			// a team the invite-link button already made still opens its page. this save is the end of creating it
			if (createdTeam) {
				navigate(`/teams/${createdTeam.teamId}`)
			}
			onSaveTeam?.()
			onClose()
		} catch (error) {
			console.error("team save failed", error)
			setRejection("That didn't save. Try again.")
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

	// the avatar the team shows: the file just uploaded, otherwise whatever the team has today
	const previewTeam = { teamId: editedTeam?.teamId ?? "", name: name || "Team", hasAvatar: false }
	const avatarUrl = useObjectUrl(avatarFile)
	const previewAvatarUrl = avatarUrl ?? (editedTeam?.hasAvatar ? `/api/team-avatars/${editedTeam.teamId}` : null)

	// leaving the field checks the name so a taken one shows early. the save checks again, and that is what rejects it
	const handleNameBlur = (): void => {
		const teamName = name.trim()
		if (teamName === "" || teamName.toLowerCase() === editedTeam?.name.trim().toLowerCase()) {
			return
		}
		void fetchTeamNameTaken(teamName).then((isTeamNameTaken) => {
			if (isTeamNameTaken) {
				setRejection(REJECTION_REASONS["name-taken"])
			}
		})
	}

	return (
		<Dialog open onOpenChange={onClose}>
			<DialogContent
				className="sm:max-w-md"
				onOpenAutoFocus={(event) => {
					// the avatar's file input is the first thing focusable here
					event.preventDefault()
					nameRef.current?.focus()
				}}
			>
				<DialogTitle className="flex items-center gap-2">
					<Users className="size-5" />
					{team ? "Edit team" : "New team"}
				</DialogTitle>
				{/* two lines on what a team gives, for the person deciding to make one */}
				{!team && (
					<p className="text-muted-foreground text-sm">A team shares its topics and a Coffee talk group with Carl.</p>
				)}
				{/* the avatar picker: the picked image, the team's stored one, or its initials */}
				<TeamAvatarPicker
					team={previewTeam}
					previewUrl={previewAvatarUrl}
					onAvatarChange={setAvatarFile}
					className="size-14"
				/>
				<div>
					<FieldLabel isRequired>Name</FieldLabel>
					<Input
						ref={nameRef}
						value={name}
						placeholder="what to call it…"
						onChange={(event) => setName(event.target.value)}
						onBlur={handleNameBlur}
						className={cn(wasNameMissed && !name.trim() && "border-destructive")}
					/>
				</div>
				<div>
					<FieldLabel>Description</FieldLabel>
					<Textarea
						value={description}
						rows={2}
						placeholder="what the team reads about…"
						onChange={(event) => setDescription(event.target.value)}
					/>
				</div>
				{/* the team's topics, selected from a combobox */}
				<div>
					<FieldLabel>Topics</FieldLabel>
					<MultiCombobox
						options={topicOptions.map((topicOption) => ({ value: topicOption.id, label: topicOption.name }))}
						values={selectedTopicIds}
						onUpdateValues={setSelectedTopicIds}
						placeholder="pick topics..."
						emptyLabel="No topics to add yet."
						newOptionLabel="New topic"
						onNewOption={() => setIsNewTopicOpen(true)}
					/>
				</div>
				{/* a leader's invite fields in both modes: the email and username invitations,
				    the link an existing team can copy, and the page's visibility below them */}
				<div className="space-y-3 border-t pt-3">
					<TeamInviteFields
						teamId={editedTeam?.teamId ?? null}
						onCreateTeam={handleCreateTeam}
						teamName={name}
						pendingInvites={pendingInvites}
						onPendingInvitesChange={setPendingInvites}
					/>
					<div className="flex items-center gap-2 text-sm">
						<Switch checked={isPublic} onCheckedChange={setIsPublic} aria-label="Public" />
						Public
					</div>
				</div>
				{/* a save rejection, shown in place */}
				{rejection && <p className="text-destructive text-sm">{rejection}</p>}
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

// save the team and its avatar, returning a rejection to show in place, or null once every write succeeded
async function saveTeam({
	team,
	fields,
	currentTopicIds,
	pendingInvites,
	avatarFile,
	onTeamSaved,
}: {
	team?: EditedTeam
	fields: { name: string; description: string | null; topicIds: string[]; isPublic: boolean }
	// the topics the team held when the modal was opened, which the selected list is compared against
	currentTopicIds: string[]
	// the invitations entered while creating, sent after the team has been created
	pendingInvites: PendingInvite[]
	avatarFile: File | null
	onTeamSaved: (team: { teamId: string }) => void
}): Promise<string | null> {
	// an edit updates its fields, and a create saves the team its avatar attaches to
	let teamId = team?.teamId ?? ""
	if (team) {
		if (
			(await sendUpdateTeam(team.teamId, {
				name: fields.name,
				description: fields.description,
				isPublic: fields.isPublic,
			})) !== null
		) {
			return REJECTION_REASONS["name-taken"]
		}

		// new selected topics are added and dropped ones are deleted
		const topicRejections = await Promise.all(
			fields.topicIds.filter((id) => !currentTopicIds.includes(id)).map((id) => sendAddTopicTeam(teamId, id)),
		)
		await Promise.all(
			currentTopicIds.filter((id) => !fields.topicIds.includes(id)).map((id) => sendRemoveTopicFromTeam(teamId, id)),
		)
		// show a topic rejection reason from the api
		const topicRejection = topicRejections.find(Boolean)
		if (topicRejection) {
			return topicRejection
		}
	} else {
		const createdTeam = await sendCreateTeam(fields)
		if ("rejection" in createdTeam) {
			return REJECTION_REASONS[createdTeam.rejection]
		}
		teamId = createdTeam.teamId
	}

	// the queued team invites are sent, each reported by a toast because the modal closes
	await sendPendingInvites(teamId, pendingInvites)

	// the selected avatar image uploads before a created team's page opens
	if (avatarFile) {
		const rejection = await sendTeamAvatar(teamId, avatarFile)
		if (rejection) {
			return AVATAR_REJECTIONS[rejection] ?? "That image didn't reach Carl. Try again."
		}
		refreshAvatars()
	}

	// a created team opens its page with the image in place
	if (!team) {
		onTeamSaved({ teamId })
	}
	return null
}
