// the invitation emails for both targets
import { reportError } from "@shared/monitoring"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import { invites, teams, topics, users } from "../../db/schema"
import { renderTeamInviteEmail, renderTeamInviteEmailText, toTeamInviteSubject } from "../../emails/team-invite-email"
import {
	renderTopicInviteEmail,
	renderTopicInviteEmailText,
	toTopicInviteSubject,
} from "../../emails/topic-invite-email"
import { sendEmail, sendEmailBatches } from "../../worker/email"
import { createTopicEmailSend } from "../../worker/notify"
import type { InviteTarget } from "./userInvites"

/**
 * Start the invitation emails without holding up the topic save that added them.
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
	const appUrl = Bun.env.BETTER_AUTH_URL?.replace(/\/$/, "")
	if (inviteEmails.length === 0 || !appUrl) {
		return
	}

	// the inviter is the topic's owner, named by username
	const [owner] = await db.select({ username: users.username }).from(users).where(eq(users.id, topic.ownerId))
	if (!owner) {
		return
	}

	// each address gets its own invite url, including the one-use token created with its invite row
	const inviteRows = await db
		.select({ email: invites.email, token: invites.token })
		.from(invites)
		.where(and(eq(invites.topicId, topic.id), inArray(invites.email, inviteEmails)))
	const tokenByEmail = new Map(inviteRows.map((inviteRow) => [inviteRow.email, inviteRow.token]))
	// filter out invite emails that do not have a token
	const invitees = inviteEmails.filter((inviteeEmail) => tokenByEmail.has(inviteeEmail))
	const messages = await Promise.all(
		invitees.map(async (inviteeEmail) => {
			const inviteUrl = `${appUrl}/invite/${tokenByEmail.get(inviteeEmail)}?src=invite-email`
			const emailProps = { inviterUsername: owner.username, topicName: topic.name, inviteeEmail, inviteUrl, appUrl }
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

// email one user invitation without holding up the response that created it
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
	const appUrl = Bun.env.BETTER_AUTH_URL?.replace(/\/$/, "")
	if (!appUrl) {
		return
	}

	// the sender is the inviter the email names, and the invite url includes the invite's own token
	const [sender] = await db.select({ username: users.username }).from(users).where(eq(users.id, senderUserId))
	if (!sender) {
		return
	}
	const inviteUrl = `${appUrl}/invite/${token}?src=invite-email`
	// each target's message goes through its own template
	if ("teamId" in target) {
		await sendTeamInviteEmail(target.teamId, sender.username, inviteeEmail, inviteUrl, appUrl)
		return
	}
	await sendTopicInviteEmail(target.topicId, sender.username, inviteeEmail, inviteUrl, appUrl)
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
