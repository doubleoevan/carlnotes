import { CHAT_NAME } from "@carlnotes/contracts/chat"
import { isLeaderRole } from "@carlnotes/contracts/enums"
import type { ConfirmElementProps } from "./confirmElement"

const DELETE_CONFIRMATION_BODY = "This can't be undone."

// the words of a confirmation, spread into each app's confirmation dialog. the body is the dialog's children
export type ConfirmationCopy = Pick<ConfirmElementProps, "title" | "confirmLabel" | "cancelLabel"> & {
	children: string
}

// deleting a comment
export const COMMENT_DELETE_CONFIRMATION: ConfirmationCopy = {
	title: "Delete this hot take?",
	children: DELETE_CONFIRMATION_BODY,
	confirmLabel: "Delete",
	cancelLabel: "Cancel",
}

/**
 * Returns the confirmation of deleting a shared chat room file or a saved chat file.
 */
export function toDeleteFileConfirmation(fileName: string): ConfirmationCopy {
	return {
		title: `Delete ${fileName}?`,
		children: DELETE_CONFIRMATION_BODY,
		confirmLabel: "Delete",
		cancelLabel: "Keep it",
	}
}

/**
 * Returns the confirmation of removing a member, from one team's table or from the Team Up menu that names the team.
 */
export function toRemoveMemberConfirmation({
	username,
	teamName = "the team",
}: {
	username: string
	teamName?: string
}): ConfirmationCopy {
	return {
		title: `Remove ${username} from ${teamName}?`,
		children: `They lose access to the team's topics and its ${CHAT_NAME}. Only a new invitation brings them back.`,
		confirmLabel: "Remove",
		cancelLabel: "Keep them",
	}
}

/**
 * Returns the confirmation of leaving a team, by name where the page has one.
 */
export function toLeaveTeamConfirmation(teamName = "this team"): ConfirmationCopy {
	return {
		title: "Leave this team?",
		children: `You lose access to ${teamName}'s topics and its ${CHAT_NAME}.`,
		confirmLabel: "Leave team",
		cancelLabel: "Stay",
	}
}

/**
 * Returns the confirmation of a press on a team member's remove control: leaving, or removing someone else.
 */
export function toLeaveOrRemoveMemberConfirmation({
	member,
	currentUserId,
}: {
	member: { userId: string; username: string }
	currentUserId: string | null | undefined
}): ConfirmationCopy {
	return member.userId === currentUserId
		? toLeaveTeamConfirmation()
		: toRemoveMemberConfirmation({ username: member.username })
}

// a leader changing their own role to member
export const STEP_DOWN_CONFIRMATION: ConfirmationCopy = {
	title: "Step down as leader?",
	children: "Only another leader can make you a leader again.",
	confirmLabel: "Step down",
	cancelLabel: "Stay leader",
}

/**
 * Whether a role change takes the user out of the leader role, which only another leader can give back.
 */
export function isStepDown({
	memberUserId,
	currentUserId,
	role,
}: {
	memberUserId: string
	currentUserId: string | null | undefined
	role: string
}): boolean {
	return memberUserId === currentUserId && !isLeaderRole(role)
}

/**
 * Returns the confirmation of deleting an invitation the user sent.
 */
export function toDeleteSentInviteConfirmation(teamName: string): ConfirmationCopy {
	return {
		title: `Delete the invitation to ${teamName}?`,
		children: "It stops working, so joining takes a new invitation.",
		confirmLabel: "Delete invitation",
		cancelLabel: "Keep it",
	}
}

/**
 * Returns the confirmation of deleting an invitation the user received.
 */
export function toDeleteReceivedInviteConfirmation(teamName: string): ConfirmationCopy {
	return {
		title: `Delete your invitation to ${teamName}?`,
		children: "You can't accept it afterward, so joining takes a new invitation.",
		confirmLabel: "Delete invitation",
		cancelLabel: "Keep it",
	}
}

/**
 * Returns the confirmation of taking a topic off a team, from the team's table or from the topic's menu that names the
 * team.
 */
export function toRemoveTopicConfirmation({
	topicName,
	teamName = "the team",
}: {
	topicName: string
	teamName?: string
}): ConfirmationCopy {
	return {
		title: `Remove ${topicName} from ${teamName}?`,
		children: "The team's members stop following it. Adding it back later leaves their emails off.",
		confirmLabel: "Remove",
		cancelLabel: "Keep it",
	}
}
