// the invite smoke's user invite sections: resolution, the invite-access setting, connections, accepting and
// declining, the daily count, and each sent invite's avatar version
import assert from "node:assert/strict"
import { and, eq } from "drizzle-orm"
import { db } from "../../db"
import { canCreateInvitesToday, toInviteLimit } from "../../db/quotas"
import { invites } from "../../db/schema/invites"
import { teamMembers } from "../../db/schema/teams"
import { subscriptions } from "../../db/schema/topics"
import { users } from "../../db/schema/users"
import { isConnected } from "../connections"
import { loadTeamsPage } from "../team/teamsPage"
import {
	createTeam,
	createTopic,
	createUser,
	insertInvite,
	loadInvite,
	loadSubscription,
	runId,
	toCreatedInvite,
} from "./inviteSmokeFixtures"
import { acceptInvite, declineInvite } from "./receivedInvites"
import { createUserInvite } from "./userInvites"

/** 5. Resolution: what each user invite kind stores on the row, and the one slot a person holds per target. */
export async function checkResolution(): Promise<void> {
	console.log("\n=== 5. resolution rule ===")
	// one sender's topic and the people its invites resolve to
	const sender = await createUser("sender5")
	const topic = await createTopic(sender.id, "resolution topic")
	const byUsername = await createUser("byname5")
	const byEmail = await createUser("byemail5")

	// a username invite stores the resolved account and no address
	const usernameInvite = toCreatedInvite(
		await createUserInvite(sender.id, { topicId: topic.id }, { username: byUsername.username }),
		"the username invite",
	)
	const usernameRow = await loadInvite(usernameInvite.id)
	assert.equal(usernameRow.invitedUserId, byUsername.id, "the username invite did not resolve the account")
	assert.equal(usernameRow.email, null, "the username invite stored an address")

	// an email invite to an address with an account stores both identifiers
	const emailInvite = toCreatedInvite(
		await createUserInvite(sender.id, { topicId: topic.id }, { email: byEmail.email }),
		"the account email invite",
	)
	const emailRow = await loadInvite(emailInvite.id)
	assert.equal(emailRow.email, byEmail.email, "the account email invite dropped the address")
	assert.equal(emailRow.invitedUserId, byEmail.id, "the account email invite did not resolve the account")

	// an email invite to an address nobody holds stores the address alone
	const noAccountAddress = `${runId}-noaccount5@example.com`
	const noAccountInvite = toCreatedInvite(
		await createUserInvite(sender.id, { topicId: topic.id }, { email: noAccountAddress }),
		"the no-account email invite",
	)
	const noAccountRow = await loadInvite(noAccountInvite.id)
	assert.equal(noAccountRow.email, noAccountAddress, "the no-account email invite dropped the address")
	assert.equal(noAccountRow.invitedUserId, null, "the no-account email invite resolved a phantom account")

	// a username invite for a person who has a declined email row reopens that row instead of inserting a secondInvite
	const declined = await createUser("declined5")
	const declinedRow = await insertInvite({
		topicId: topic.id,
		email: declined.email,
		invitedByUserId: sender.id,
		declinedAt: new Date(),
	})
	const reopened = toCreatedInvite(
		await createUserInvite(sender.id, { topicId: topic.id }, { username: declined.username }),
		"the reopening username invite",
	)
	assert.equal(reopened.id, declinedRow.id, "the re-invite inserted a secondInvite row instead of reopening")
	assert.equal((await loadInvite(declinedRow.id)).declinedAt, null, "the reopened row kept its declined time")
	// still exactly one row for this person on the topic
	const slotRows = await db
		.select()
		.from(invites)
		.where(and(eq(invites.topicId, topic.id), eq(invites.email, declined.email)))
	assert.equal(slotRows.length, 1, "the person holds more than one slot on the topic")
	console.log("PASS  each mode stores what it resolved, and a declined row reopens as the one slot")
}

/**
 * 6. Each invite-access setting: nobody rejects every sender, connected admits only a connected one, anyone admits
 * an unconnected sender.
 */
export async function checkInviteAccess(): Promise<void> {
	console.log("\n=== 6. invite-access ===")
	// an unconnected sender, a teammate sender, and one recipient per setting
	const unconnectedSender = await createUser("unconnectedsender6")
	const unconnectedSenderTopic = await createTopic(unconnectedSender.id, "unconnected sender topic")
	const teammateSender = await createUser("teammatesender6")
	const teammateTopic = await createTopic(teammateSender.id, "teammate sender topic")
	const rejectsAll = await createUser("nobody6", { inviteAccess: "nobody" })
	const connectedOnly = await createUser("connected6", { inviteAccess: "connected" })
	const admitsAll = await createUser("anyone6", { inviteAccess: "anyone" })

	// the teammate sender shares a team with both guarded recipients
	const team = await createTeam("setting team", teammateSender.id)
	await db.insert(teamMembers).values([
		{ teamId: team.id, userId: rejectsAll.id },
		{ teamId: team.id, userId: connectedOnly.id },
	])

	// nobody rejects the unconnected sender and the teammate alike
	assert.equal(
		await createUserInvite(
			unconnectedSender.id,
			{ topicId: unconnectedSenderTopic.id },
			{ username: rejectsAll.username },
		),
		"not-accepting",
		"a nobody recipient admitted an unconnected sender",
	)
	assert.equal(
		await createUserInvite(teammateSender.id, { topicId: teammateTopic.id }, { username: rejectsAll.username }),
		"not-accepting",
		"a nobody recipient admitted a teammate",
	)

	// connected rejects the unconnected sender and admits the sender who shares a team
	assert.equal(
		await createUserInvite(
			unconnectedSender.id,
			{ topicId: unconnectedSenderTopic.id },
			{ username: connectedOnly.username },
		),
		"not-accepting",
		"a connected-only recipient admitted an unconnected sender",
	)
	toCreatedInvite(
		await createUserInvite(teammateSender.id, { topicId: teammateTopic.id }, { username: connectedOnly.username }),
		"the teammate's invite to a connected-only recipient",
	)

	// anyone admits the unconnected sender
	toCreatedInvite(
		await createUserInvite(
			unconnectedSender.id,
			{ topicId: unconnectedSenderTopic.id },
			{ username: admitsAll.username },
		),
		"the unconnected sender's invite to an anyone recipient",
	)
	console.log(
		"PASS  nobody rejects everyone, connected admits only a connected sender, anyone admits an unconnected sender",
	)
}

/**
 * 7. What counts as connected: a shared team, an active subscription, and an accepted invitation, but never two
 * unconnected users.
 */
export async function checkIsConnected(): Promise<void> {
	console.log("\n=== 7. isConnected derivations ===")
	// a teammate pair on one team
	const teamSender = await createUser("teamsender7")
	const teammate = await createUser("teammate7")
	const team = await createTeam("connection team", teamSender.id)
	await db.insert(teamMembers).values({ teamId: team.id, userId: teammate.id })
	assert.equal(await isConnected(teamSender.id, teammate.id), true, "a shared team does not connect")

	// an active subscriber to the sender's topic connects, and an inactive one does not
	const topicOwner = await createUser("topicowner7")
	const topic = await createTopic(topicOwner.id, "connection topic")
	const activeSubscriber = await createUser("activesub7")
	const inactiveSubscriber = await createUser("inactivesub7")
	await db.insert(subscriptions).values([
		{ topicId: topic.id, subscriberUserId: activeSubscriber.id },
		{ topicId: topic.id, subscriberUserId: inactiveSubscriber.id, isActive: false },
	])
	assert.equal(await isConnected(topicOwner.id, activeSubscriber.id), true, "an active subscription does not connect")
	assert.equal(await isConnected(topicOwner.id, inactiveSubscriber.id), false, "an inactive subscription connects")

	// a previously accepted invitation connects, read through its spent use
	const pastSender = await createUser("pastsender7")
	const pastTopic = await createTopic(pastSender.id, "past invitation topic")
	const acceptor = await createUser("acceptor7")
	await insertInvite({
		topicId: pastTopic.id,
		invitedUserId: acceptor.id,
		invitedByUserId: pastSender.id,
		usedCount: 1,
	})
	assert.equal(await isConnected(pastSender.id, acceptor.id), true, "an accepted invitation does not connect")

	// two users who share nothing never connect
	const unconnectedUserA = await createUser("unconnecteda7")
	const unconnectedUserB = await createUser("unconnectedb7")
	assert.equal(await isConnected(unconnectedUserA.id, unconnectedUserB.id), false, "two unconnected users connect")
	console.log(
		"PASS  a shared team, an active subscription, and an accepted invitation connect, unconnected users do not",
	)
}

/** 8. Accepting works the same by token or by row, and a declined invitation can no longer be answered. */
export async function checkAcceptAndDecline(): Promise<void> {
	console.log("\n=== 8. accept by token and by row ===")
	// one sender with a plain topic, a team holding a topic, and the recipient of all three invitations
	const sender = await createUser("sender8")
	const recipient = await createUser("recipient8")
	const soloTopic = await createTopic(sender.id, "accepted topic")
	const team = await createTeam("accepted team", sender.id)
	const teamTopic = await createTopic(sender.id, "team held topic", team.id)

	// accepting a username topic invite activates the subscription and spends the use
	const topicInvite = await insertInvite({
		topicId: soloTopic.id,
		invitedUserId: recipient.id,
		invitedByUserId: sender.id,
	})
	const topicOutcome = await acceptInvite(recipient.id, topicInvite.id)
	assert.equal(topicOutcome.status, "joined", `the topic acceptance answered ${topicOutcome.status}`)
	assert.equal(
		(await loadSubscription(recipient.id, soloTopic.id))?.isActive,
		true,
		"the acceptance left no active subscription",
	)
	assert.equal((await loadInvite(topicInvite.id)).usedCount, 1, "the topic acceptance spent no use")

	// accepting a username team invite writes the membership and a subscription with email off per held topic
	const teamInvite = await insertInvite({ teamId: team.id, invitedUserId: recipient.id, invitedByUserId: sender.id })
	const teamOutcome = await acceptInvite(recipient.id, teamInvite.id)
	assert.equal(teamOutcome.status, "joinedTeam", `the team acceptance answered ${teamOutcome.status}`)
	// the membership row, then the subscription with email off that the join fanned out on the held topic
	const [membership] = await db
		.select()
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, recipient.id)))
	assert.equal(membership?.role, "member", "the team acceptance wrote no membership")
	const teamSubscription = await loadSubscription(recipient.id, teamTopic.id)
	assert.equal(teamSubscription?.isActive, true, "the join fanned out no subscription on the held topic")
	assert.equal(teamSubscription?.isEmailEnabled, false, "the fanned-out subscription still has email on")

	// declining saves the row, and the declined invitation returns unknown ever after
	const laterTopic = await createTopic(sender.id, "declined topic")
	const declinedInvite = await insertInvite({
		topicId: laterTopic.id,
		invitedUserId: recipient.id,
		invitedByUserId: sender.id,
	})
	assert.ok(await declineInvite(recipient.id, declinedInvite.id), "the recipient could not decline")
	assert.ok((await loadInvite(declinedInvite.id)).declinedAt, "the decline saved no time")
	const declinedOutcome = await acceptInvite(recipient.id, declinedInvite.id)
	assert.equal(declinedOutcome.status, "unknown", "a declined invitation could still be accepted")
	console.log("PASS  accepting joins both targets, and a declined invitation no longer answers")
}

/** 9. The daily count ignores username invites and counts email rows, held to the computed limit. */
export async function checkDailyCount(): Promise<void> {
	console.log("\n=== 9. daily invite count ===")
	// a fresh free sender, whose limit today comes from the same formula the quota check uses
	const sender = await createUser("sender9", { isFresh: true })
	const topic = await createTopic(sender.id, "daily count topic")
	const limit = toInviteLimit({ plan: "free", accountAgeDays: 0, acceptedShare: null, isConnectedRecipient: false })
	console.log(`computed limit for a fresh free sender: ${limit}`)

	// several username invites through the real creation path
	const recipients = await Promise.all(["daily9a", "daily9b", "daily9c"].map((label) => createUser(label)))
	for (const recipient of recipients) {
		toCreatedInvite(
			await createUserInvite(sender.id, { topicId: topic.id }, { username: recipient.username }),
			`the username invite to ${recipient.username}`,
		)
	}

	// the username rows never count, so the full limit still fits and one past it does not
	assert.equal(await canCreateInvitesToday(sender.id, limit), true, "username invites drew from the daily allowance")
	assert.equal(await canCreateInvitesToday(sender.id, limit + 1), false, "the computed limit did not hold")

	// email rows do count: once directly inserted rows reach the limit, the answer flips
	await db.insert(invites).values(
		Array.from({ length: limit }, (_, index) => ({
			topicId: topic.id,
			email: `${runId}-daily9-${index}@example.com`,
			invitedByUserId: sender.id,
		})),
	)
	assert.equal(await canCreateInvitesToday(sender.id), false, "email invites did not draw from the daily allowance")
	console.log(`PASS  ${recipients.length} username invites count for nothing, ${limit} email rows use the day up`)
}

/** 10. A sent team invite names each invitee's avatar version, read from the account that the invite resolved to. */
export async function checkSentInviteAvatarVersions(): Promise<void> {
	console.log("\n=== 10. sent invite avatar versions ===")
	// a leader's team, an invitee named by account, and an invitee reached by address alone
	const sender = await createUser("avatar10-sender")
	const team = await createTeam("avatar10", sender.id)
	const accountInvitee = await createUser("avatar10-account")
	const addressInvitee = await createUser("avatar10-email")

	// each invitee uploaded an avatar under its own key id. the keys are never read from storage here
	for (const invitee of [accountInvitee, addressInvitee]) {
		await db
			.update(users)
			.set({ avatarSource: "upload", avatarKey: `avatars/${invitee.id}/${invitee.name}-${runId}.png` })
			.where(eq(users.id, invitee.id))
	}

	// one invite resolved to the account, and one sent to the address
	await insertInvite({ teamId: team.id, invitedUserId: accountInvitee.id, invitedByUserId: sender.id })
	await insertInvite({ teamId: team.id, email: addressInvitee.email, invitedByUserId: sender.id })

	// each invitee's version is the one in its own account's key
	const { sentInvites } = await loadTeamsPage(sender.id)
	const versionByInviteeId = new Map(
		sentInvites.map((sentInvite) => [sentInvite.invitee?.userId, sentInvite.invitee?.avatarVersion]),
	)
	assert.equal(versionByInviteeId.get(accountInvitee.id), `avatar10-account-${runId}`, "the account invitee's version")
	assert.equal(versionByInviteeId.get(addressInvitee.id), `avatar10-email-${runId}`, "the address invitee's version")
	console.log("PASS  each sent invite names its invitee's own avatar version")
}
