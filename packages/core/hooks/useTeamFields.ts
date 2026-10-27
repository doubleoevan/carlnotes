import { fetchTeamNameTaken } from "@carlnotes/client/teamClient"
import type { CreateTeamPayload } from "@carlnotes/contracts/payloads"
import { type Dispatch, type SetStateAction, useRef, useState } from "react"
import { TEAM_REJECTION_REASONS } from "../lib/saveTeam"
import type { EditedTeam, PendingInvite, TopicOption } from "../lib/teamFields"

/**
 * Holds the same editable team fields and save payload for either platform.
 */
export function useTeamFields<Avatar>({
	team,
	currentTopics,
	initialTopicIds,
	initialInvites,
}: {
	team?: EditedTeam
	currentTopics?: TopicOption[]
	initialTopicIds?: string[]
	initialInvites?: PendingInvite[]
}): {
	name: string
	setName: (name: string) => void
	nameRejection: string | null
	checkName: (ownedName?: string) => Promise<void>
	description: string
	setDescription: (description: string) => void
	isPublic: boolean
	setIsPublic: (isPublic: boolean) => void
	selectedTopicIds: string[]
	setSelectedTopicIds: (ids: string[]) => void
	pendingInvites: PendingInvite[]
	setPendingInvites: Dispatch<SetStateAction<PendingInvite[]>>
	avatarFile: Avatar | null
	setAvatarFile: (avatar: Avatar | null) => void
	savedFields: CreateTeamPayload
} {
	// seed the draft once, retaining edits until the modal closes
	const nameField = useTeamName(team?.name)
	const [description, setDescription] = useState(team?.description ?? "")
	const [isPublic, setIsPublic] = useState(team?.isPublic ?? false)
	const [selectedTopicIds, setSelectedTopicIds] = useState(
		team ? (currentTopics ?? []).map((topic) => topic.id) : (initialTopicIds ?? []),
	)
	const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>(initialInvites ?? [])
	const [avatarFile, setAvatarFile] = useState<Avatar | null>(null)
	return {
		...nameField,
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
		savedFields: {
			name: nameField.name,
			description: description.trim() || null,
			topicIds: selectedTopicIds,
			isPublic,
		},
	}
}

// ignore stale availability replies and let the save endpoint decide after a failed lookup
function useTeamName(initialName = ""): {
	name: string
	setName: (name: string) => void
	nameRejection: string | null
	checkName: (ownedName?: string) => Promise<void>
} {
	const [name, setName] = useState(initialName)
	const [nameRejection, setNameRejection] = useState<string | null>(null)
	const revision = useRef(0)
	async function checkName(ownedName = initialName): Promise<void> {
		// changing the input or starting a newer request retires this reply
		const requestRevision = ++revision.current
		const teamName = name.trim()
		if (!teamName || teamName.toLowerCase() === ownedName.trim().toLowerCase()) {
			setNameRejection(null)
			return
		}
		try {
			const isTaken = await fetchTeamNameTaken(teamName)
			if (requestRevision === revision.current) {
				setNameRejection(isTaken ? TEAM_REJECTION_REASONS["name-taken"] : null)
			}
		} catch {
			// keep editing available when the advisory name lookup is offline
			if (requestRevision === revision.current) {
				setNameRejection(null)
			}
		}
	}
	return {
		name,
		nameRejection,
		checkName,
		setName: (nextName) => {
			revision.current += 1
			setNameRejection(null)
			setName(nextName)
		},
	}
}
