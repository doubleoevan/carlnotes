// the team save flow: the create, the save that creates or updates, and what each rejection tells the person saving
import {
	type CreateTeamRejection,
	sendAddTopicTeam,
	sendCreateTeam,
	sendRemoveTopicFromTeam,
	sendTeamAvatar,
	sendUpdateTeam,
} from "@carlnotes/client/teamClient"
import type { CreateTeamPayload } from "@carlnotes/contracts/payloads"
import { AVATAR_REJECTIONS } from "@/components/avatar/AvatarUpload"
import { type PendingInvite, sendPendingInvites } from "@/components/invite/TeamInviteFields"

// what each rejection tells the person saving a team, in the team modal and the topic modal's teams field
export const TEAM_REJECTION_REASONS: Record<CreateTeamRejection, string> = {
	quota: "You have reached your limit of teams for one day. Try again tomorrow.",
	"name-taken": "A team already has that name. Try another.",
	failed: "That team didn't save. Try again.",
}

// a created team's id, or the rejection reason to show
export type CreateTeamResult = { teamId: string } | { rejection: string }

// the writes one team save makes
export interface SaveTeamOptions {
	// the team being edited. absent creates one
	team?: { teamId: string }
	fields: CreateTeamPayload
	// the topics the team held when the modal was opened, which the selected list is compared against
	currentTopicIds: string[]
	// the invitations entered while creating, sent after the team has been created
	pendingInvites: PendingInvite[]
	avatarFile: File | null
	onTeamSaved: (team: { teamId: string }) => void
}

/**
 * Saves the team and its avatar, returning a rejection to show in place, or null once every write succeeded.
 */
export async function saveTeam({
	team,
	fields,
	currentTopicIds,
	pendingInvites,
	avatarFile,
	onTeamSaved,
}: SaveTeamOptions): Promise<string | null> {
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
		// a create shows its rejection reason in place
		const createTeamResult = await createTeam(fields)
		if ("rejection" in createTeamResult) {
			return createTeamResult.rejection
		}
		teamId = createTeamResult.teamId
	}

	// the queued team invites are sent, each reported by a toast because the modal closes
	await sendPendingInvites(teamId, pendingInvites)

	// the selected avatar image uploads before a created team's page opens
	if (avatarFile) {
		const avatarRejection = await sendTeamAvatar(teamId, avatarFile)
		if (avatarRejection) {
			return AVATAR_REJECTIONS[avatarRejection] ?? "That image didn't reach Carl. Try again."
		}
	}

	// a created team opens its page with the image in place
	if (!team) {
		onTeamSaved({ teamId })
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
