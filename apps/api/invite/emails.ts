// the invitation emails for both targets

import { toInvitePath } from "@carlnotes/contracts/seo"
import { db } from "@carlnotes/db"
import { invites } from "@carlnotes/db/schema/invites"
import { teams } from "@carlnotes/db/schema/teams"
import { topics } from "@carlnotes/db/schema/topics"
import { sendEmail, sendEmailBatches } from "@carlnotes/emails/email"
import {
	renderTeamInviteEmail,
	renderTeamInviteEmailText,
	toTeamInviteSubject,
} from "@carlnotes/emails/team-invite-email"
import {
	renderTopicInviteEmail,
	renderTopicInviteEmailText,
	toTopicInviteSubject,
} from "@carlnotes/emails/topic-invite-email"
import { createTopicEmailSend } from "@carlnotes/pipeline/notify"
import { appBaseUrl } from "@carlnotes/server/appUrl"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq, inArray } from "drizzle-orm"
import { loadUsername } from "../usernames"
import type { InviteTarget } from "./userInvites"

/**
 * Start the invitation emails without delaying the topic save that added them.
 */
export function startInviteEmails(topic: { id: string; name: string; ownerId: string }, inviteEmails: string[]): void {
	sendTopicInviteEmails(topic, inviteEmails).catch((error) => {
		console.error(`could not send topic invitations for topic ${topic.id}`, error)
		reportError(error, "email", { emailKind: "topic-invite", topicId: topic.id })
	})
}

// email each invited email address its invitation, naming the owner and linking to the topic page
async function sendTopicInviteEmails(
	topic: { id: string; name: string; ownerId: string },
	inviteEmails: string[],
): Promise<void> {
	// skip if there are no emails to send, or with no app url there is no link to invite anyone to
	const appUrl = appBaseUrl()
	if (inviteEmails.length === 0 || !appUrl) {
		return
	}

	// the inviter is the topic's owner, named by username
	const ownerUsername = await loadUsername(topic.ownerId)
	if (!ownerUsername) {
		return
	}

	// each address gets its own invite url, including the one-use token created with its invite row
	const inviteRows = await db
		.select({ email: invites.email, token: invites.token })
		.from(invites)
		.where(and(eq(invites.topicId, topic.id), inArray(invites.email, inviteEmails)))
	const tokenByEmail = new Map(inviteRows.map((inviteRow) => [inviteRow.email, inviteRow.token]))
	// the invite emails that have a token, each with its token
	const invitees = inviteEmails.flatMap((inviteeEmail) => {
		const token = tokenByEmail.get(inviteeEmail)
		return token ? [{ inviteeEmail, token }] : []
	})
	const messages = await Promise.all(
		invitees.map(async ({ inviteeEmail, token }) => {
			const inviteUrl = `${appUrl}${toInvitePath(token)}?src=invite-email`
			const emailProps = { inviterUsername: ownerUsername, topicName: topic.name, inviteeEmail, inviteUrl, appUrl }
			return {
				to: inviteeEmail,
				subject: toTopicInviteSubject(emailProps),
				emailContent: await renderTopicInviteEmail(emailProps),
				plainTextContent: await renderTopicInviteEmailText(emailProps),
				emailKind: "topic-invite" as const,
			}
		}),
	)

	// each message send is recorded with its own acceptance flag
	const acceptances = await sendEmailBatches(messages)
	for (const [index] of invitees.entries()) {
		await createTopicEmailSend({
			topicId: topic.id,
			emailKind: "topic-invite",
			recipientUserId: null,
			isAccepted: acceptances[index] ?? false,
		})
	}
}

// email one user invitation without delaying the response that created it
// the invite target could be a topic or a team
export function startUserInviteEmail(
	target: InviteTarget,
	senderUserId: string,
	inviteeEmail: string,
	token: string,
): void {
	// a failed send is logged and reported, never surfaced as a failed invite
	sendUserInviteEmail(target, senderUserId, inviteeEmail, token).catch((error) => {
		// the log names the target, never the address, which is a person's private detail
		const targetId = "topicId" in target ? target.topicId : target.teamId
		console.error(`could not send a user invitation for ${targetId}`, error)
		reportError(error, "email", { emailKind: "topicId" in target ? "topic-invite" : "team-invite" })
	})
}

// the one user invitation email, worded for its target and linking the invitee's own invite url
async function sendUserInviteEmail(
	target: InviteTarget,
	senderUserId: string,
	inviteeEmail: string,
	token: string,
): Promise<void> {
	// with no app url there is no link to invite anyone to
	const appUrl = appBaseUrl()
	if (!appUrl) {
		return
	}

	// the sender is the inviter the email names, and the invite url includes the invite's own token
	const senderUsername = await loadUsername(senderUserId)
	if (!senderUsername) {
		return
	}
	const inviteUrl = `${appUrl}${toInvitePath(token)}?src=invite-email`
	// each target's message goes through its own template
	if ("teamId" in target) {
		await sendTeamInviteEmail(target.teamId, senderUsername, inviteeEmail, inviteUrl, appUrl)
		return
	}
	await sendTopicInviteEmail(target.topicId, senderUsername, inviteeEmail, inviteUrl, appUrl)
}

// the team invitation, sent through the team template
async function sendTeamInviteEmail(
	teamId: string,
	inviterUsername: string,
	inviteeEmail: string,
	inviteUrl: string,
	appUrl: string,
): Promise<void> {
	// the subject and both bodies come from the one template, so they always name the same team
	const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, teamId))
	if (!team) {
		return
	}
	const emailProps = {
		senderUsername: inviterUsername,
		teamName: team.name,
		recipientEmail: inviteeEmail,
		inviteUrl,
		appUrl,
	}
	await sendEmail({
		to: inviteeEmail,
		subject: toTeamInviteSubject(emailProps),
		emailContent: await renderTeamInviteEmail(emailProps),
		plainTextContent: await renderTeamInviteEmailText(emailProps),
		emailKind: "team-invite",
	})
}

// the topic invitation, through the same template the topic save sends, recorded like its sends are
async function sendTopicInviteEmail(
	topicId: string,
	inviterUsername: string,
	inviteeEmail: string,
	inviteUrl: string,
	appUrl: string,
): Promise<void> {
	// the subject and both bodies come from the one template, so they always name the same topic
	const [topic] = await db.select({ name: topics.name }).from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		return
	}
	const emailProps = { inviterUsername, topicName: topic.name, inviteeEmail, inviteUrl, appUrl }
	const isAccepted = await sendEmail({
		to: inviteeEmail,
		subject: toTopicInviteSubject(emailProps),
		emailContent: await renderTopicInviteEmail(emailProps),
		plainTextContent: await renderTopicInviteEmailText(emailProps),
		emailKind: "topic-invite",
	})
	await createTopicEmailSend({ topicId, emailKind: "topic-invite", recipientUserId: null, isAccepted })
}
