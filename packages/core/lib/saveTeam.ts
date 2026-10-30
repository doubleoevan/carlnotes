// the team save flow: the create, the save that creates or updates, and what each rejection tells the person saving
import {
	type CreateTeamRejection,
	sendAddTopicTeam,
	sendCreateTeam,
	sendRemoveTopicFromTeam,
	sendUpdateTeam,
} from "@carlnotes/client/teamClient"
import type { CreateTeamPayload } from "@carlnotes/contracts/payloads"
import { TEAM_AVATAR_UPLOAD_FAILED_TEXT, toAvatarRejectionText } from "./avatarUpload"
import type { PendingInvite } from "./teamFields"

// what each rejection tells the person saving a team, in the team modal and the topic modal's teams field
export const TEAM_REJECTION_REASONS: Record<CreateTeamRejection, string> = {
	quota: "You have reached your limit of teams for one day. Try again tomorrow.",
	"name-taken": "A team already has that name. Try another.",
	failed: "That team didn't save. Try again.",
}

// a created team's id, or the rejection reason to show
export type CreateTeamResult = { teamId: string } | { rejection: string }

// the writes one team save makes
export interface SaveTeamOptions<Avatar> {
	// the team being edited. absent creates one
	team?: { teamId: string }
	fields: CreateTeamPayload
	// the topics the team held when the modal was opened, which the selected list is compared against
	currentTopicIds: string[]
	// the invitations entered while creating, sent after the team has been created
	pendingInvites: PendingInvite[]
	avatarFile: Avatar | null
	uploadAvatar: (teamId: string, avatar: Avatar) => Promise<string | null>
	sendInvites: (teamId: string, invites: PendingInvite[]) => Promise<void>
	onTeamSaved: (team: { teamId: string }) => void
	onTeamCreated?: (teamId: string) => void
	onTopicsSaved?: (topicIds: string[]) => void
}

/**
 * Saves the team and its avatar, returning a rejection to show in place, or null once every write succeeded.
 */
export async function saveTeam<Avatar>({
	team,
	fields,
	currentTopicIds,
	pendingInvites,
	avatarFile,
	uploadAvatar,
	sendInvites,
	onTeamSaved,
	onTeamCreated,
	onTopicsSaved,
}: SaveTeamOptions<Avatar>): Promise<string | null> {
	// an edit updates its fields, and a create saves the team its avatar attaches to
	let teamId = team?.teamId ?? ""
	if (team) {
		// a taken name and a failed save each show their own reason
		const updateRejection = await sendUpdateTeam(team.teamId, {
			name: fields.name,
			description: fields.description,
			isPublic: fields.isPublic,
		})
		if (updateRejection) {
			return TEAM_REJECTION_REASONS[updateRejection]
		}

		// new selected topics are added and dropped ones are deleted
		const topicRejection = await saveTeamTopics({
			teamId,
			currentTopicIds,
			selectedTopicIds: fields.topicIds,
			onTopicsSaved,
		})
		if (topicRejection) {
			return topicRejection
		}
	} else {
		// a create shows its rejection reason in place
		const createTeamResult = await createTeam(fields)
		if ("rejection" in createTeamResult) {
			return createTeamResult.rejection
		}
		teamId = createTeamResult.teamId
		onTeamCreated?.(teamId)
		onTopicsSaved?.(fields.topicIds)
	}

	// let each platform report the results of the staged invitations
	await sendInvites(teamId, pendingInvites)

	// the selected avatar image uploads before a created team's page opens
	if (avatarFile) {
		const avatarRejection = await uploadAvatar(teamId, avatarFile)
		if (avatarRejection) {
			return toAvatarRejectionText(avatarRejection, TEAM_AVATAR_UPLOAD_FAILED_TEXT)
		}
	}

	// a created team opens its page with the image in place
	if (!team) {
		onTeamSaved({ teamId })
	}
	return null
}

// retain each successful write for a retry, and stop before removals if an addition failed
async function saveTeamTopics({
	teamId,
	currentTopicIds,
	selectedTopicIds,
	onTopicsSaved,
}: {
	teamId: string
	currentTopicIds: string[]
	selectedTopicIds: string[]
	onTopicsSaved?: (topicIds: string[]) => void
}): Promise<string | null> {
	// add each newly selected topic, reporting the saved set after each one
	const savedTopicIds = new Set(currentTopicIds)
	for (const topicId of selectedTopicIds.filter((id) => !savedTopicIds.has(id))) {
		const rejection = await sendAddTopicTeam(teamId, topicId)
		if (rejection) {
			return rejection
		}

		// the add saved, so the set includes it now
		savedTopicIds.add(topicId)
		onTopicsSaved?.([...savedTopicIds])
	}

	// remove each topic that is no longer selected, the same way
	for (const topicId of currentTopicIds.filter((id) => !selectedTopicIds.includes(id))) {
		if (!(await sendRemoveTopicFromTeam(teamId, topicId))) {
			return "A topic couldn't be removed. Try saving again."
		}

		// the removal saved, so the set leaves it out now
		savedTopicIds.delete(topicId)
		onTopicsSaved?.([...savedTopicIds])
	}
	return null
}

/**
 * Creates the invite-link button's team with no topics, so the final Save attaches the selection once.
 */
export async function createTeamForInviteLink(fields: CreateTeamPayload): Promise<CreateTeamResult> {
	return createTeam({ ...fields, topicIds: [] })
}

/**
 * Creates a team, returning its id or the rejection reason to show.
 */
export async function createTeam(fields: CreateTeamPayload): Promise<CreateTeamResult> {
	const sendCreateTeamResult = await sendCreateTeam(fields)
	if ("rejection" in sendCreateTeamResult) {
		return { rejection: TEAM_REJECTION_REASONS[sendCreateTeamResult.rejection] }
	}
	return sendCreateTeamResult
}
