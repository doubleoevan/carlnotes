// a live smoke test for the invite lifecycle and deleted at the end.
// run it with: doppler run -- bun api/invite/invites.smoke.ts. needs Doppler secrets
import assert from "node:assert/strict"
import type { Invite } from "@shared/contracts"
import { toNormalizedUsername } from "@shared/usernames"
import { and, eq, inArray } from "drizzle-orm"
import { connectionPool, db } from "../../db"
import { canCreateInvitesToday, toInviteLimit } from "../../db/quotas"
import { invites, subscriptions, teamMembers, teams, topics, users } from "../../db/schema"
import { isConnected } from "../connections"
import type { AnalyticsProperties } from "../currentUser"
import { acceptInviteToken, createTeamInvite, createTopicInvite, revokeTopicInvite, toInviteRefusal } from "./invites"
import type { UserInviteRefusal } from "./userInvites"
import { acceptInvite, createUserInvite, declineInvite } from "./userInvites"

// these keys are dropped before any invite call runs
delete Bun.env.RESEND_API_KEY
delete Bun.env.POSTHOG_API_KEY
delete Bun.env.BETTER_AUTH_URL

// one id per run, so emails, usernames, and team names don't collide with an earlier run's rows
const runId = `invsmoke-${Date.now()}`

// every account and team created here, deleted at the end. topics and invites cascade off the accounts
const createdUserIds: string[] = []
const createdTeamIds: string[] = []

// accounts are backdated a month by default
const BACKDATED_CREATED_AT = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

// the analytics shape createTopicInvite asks for. the capture key is dropped above, so nothing sends
const ANALYTICS: AnalyticsProperties = {
	plan: "free",
	platform: "desktop",
	browserPlatform: "other",
	isInAppBrowser: false,
}

// 1. only edit authority creates a link, and a revoked one returns revoked
async function checkLinkCreateAuthority(): Promise<void> {
	console.log("\n=== 1. link create authority ===")
	// an owner with a topic, and a stranger with no access to it
	const owner = await createUser("owner1")
	const stranger = await createUser("stranger1")
	const topic = await createTopic(owner.id, "link authority topic")

	// the stranger is refused, and the owner gets a live link with the link limits
	assert.equal(
		await createTopicInvite(stranger.id, topic.id, "copy-link", ANALYTICS),
		"forbidden",
		"a non-owner created a link",
	)
	const created = toCreatedInvite(
		await createTopicInvite(owner.id, topic.id, "copy-link", ANALYTICS),
		"the owner's link",
	)
	assert.equal(created.maxUses, 25, "the owner's link does not have the link use limit")
	assert.equal(toInviteRefusal(await loadInvite(created.id), new Date()), null, "the fresh link is not live")

	// revoking saves the row, and the refusal reads revoked
	assert.ok(await revokeTopicInvite(owner.id, topic.id, created.id), "the owner could not revoke their link")
	const revoked = await loadInvite(created.id)
	assert.ok(revoked.revokedAt, "the revocation saved no time")
	assert.equal(toInviteRefusal(revoked, new Date()), "revoked", "a revoked link does not answer revoked")
	console.log("PASS  the stranger is refused, the owner's link lives, revocation answers revoked")

	// a team link is a member's power the same way, and an outsider is refused
	const team = await createTeam("authority team", owner.id)
	assert.equal(
		await createTeamInvite(stranger.id, team.id, "copy-link", ANALYTICS),
		"forbidden",
		"an outsider created a team link",
	)
	console.log("PASS  an outsider cannot create a team link")
}

// 2. a valid acceptance subscribes the accepter and spends one use, and arriving again spends nothing
async function checkValidAcceptance(): Promise<void> {
	console.log("\n=== 2. valid acceptance ===")
	// a five-use link on the owner's topic, and the person accepting it
	const owner = await createUser("owner2")
	const accepter = await createUser("accepter2")
	const topic = await createTopic(owner.id, "accepted topic")
	const invite = await insertInvite({ topicId: topic.id, invitedByUserId: owner.id, maxUses: 5 })

	// the first acceptance joins, activates the subscription, and spends one use
	const first = await acceptInviteToken(accepter.id, invite.token)
	assert.equal(first.status, "joined", `the first acceptance answered ${first.status}`)
	const subscription = await loadSubscription(accepter.id, topic.id)
	assert.equal(subscription?.isActive, true, "the acceptance left no active subscription")
	assert.equal((await loadInvite(invite.id)).usedCount, 1, "the first acceptance did not spend one use")

	// accepting again as the same user returns joined without a second use or a second subscription row
	const again = await acceptInviteToken(accepter.id, invite.token)
	assert.equal(again.status, "joined", `the repeat acceptance answered ${again.status}`)
	assert.equal((await loadInvite(invite.id)).usedCount, 1, "the repeat acceptance spent a second use")
	// still exactly one subscription row for the accepter
	const subscriptionRows = await db
		.select()
		.from(subscriptions)
		.where(and(eq(subscriptions.topicId, topic.id), eq(subscriptions.subscriberUserId, accepter.id)))
	assert.equal(subscriptionRows.length, 1, "the repeat acceptance wrote a second subscription row")
	console.log("PASS  one join, one spent use, and a repeat arrival spends nothing")
}

// 3. four concurrent accepters race a two-use link, and the conditional spend admits exactly two
async function checkUseLimitRace(): Promise<void> {
	console.log("\n=== 3. use-limit race ===")
	// a two-use link and four different accepters arriving at once
	const owner = await createUser("owner3")
	const topic = await createTopic(owner.id, "race topic")
	const invite = await insertInvite({ topicId: topic.id, invitedByUserId: owner.id, maxUses: 2 })
	const accepters = await Promise.all(["racer3a", "racer3b", "racer3c", "racer3d"].map((label) => createUser(label)))

	// all four accept concurrently, so the conditional spend is the only thing serializing them
	const outcomes = await Promise.all(accepters.map((accepter) => acceptInviteToken(accepter.id, invite.token)))
	const joinedCount = outcomes.filter((outcome) => outcome.status === "joined").length
	const exhaustedCount = outcomes.filter((outcome) => outcome.status === "exhausted").length
	assert.equal(joinedCount, 2, `${joinedCount} of four racers joined a two-use link`)
	assert.equal(exhaustedCount, 2, `${exhaustedCount} of four racers were answered exhausted`)
	assert.equal((await loadInvite(invite.id)).usedCount, 2, "the race moved usedCount off the limit")
	console.log("PASS  exactly two joined, two were answered exhausted, and usedCount ended at two")
}

// 4. a team at its member limit refuses the link acceptance and hands the spent use back
async function checkTeamLimitRefund(): Promise<void> {
	console.log("\n=== 4. team-limit refund ===")
	// a free-plan leader's team filled to the free member limit of ten
	const leader = await createUser("leader4")
	const team = await createTeam("limit team", leader.id)
	const fillers = await db
		.insert(users)
		.values(Array.from({ length: 9 }, (_, index) => toUserValues(`filler4-${index}`)))
		.returning()
	createdUserIds.push(...fillers.map((filler) => filler.id))
	await db.insert(teamMembers).values(fillers.map((filler) => ({ teamId: team.id, userId: filler.id })))

	// an eleventh person accepts a live team link and is refused at the limit
	const invite = await insertInvite({ teamId: team.id, invitedByUserId: leader.id, maxUses: 25 })
	const eleventh = await createUser("eleventh4")
	const outcome = await acceptInviteToken(eleventh.id, invite.token)
	assert.equal(outcome.status, "exhausted", `the full team answered ${outcome.status}`)

	// the refusal handed the spent use back and wrote no membership
	assert.equal((await loadInvite(invite.id)).usedCount, 0, "the refused join kept the spent use")
	const [membership] = await db
		.select()
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, eleventh.id)))
	assert.equal(membership, undefined, "the full team still gained a member")
	console.log("PASS  the full team refuses the link and the spent use is refunded")
}

// 5. resolution: what each user invite kind stores on the row, and the one slot a person holds per target
async function checkResolution(): Promise<void> {
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
	const strangerAddress = `${runId}-stranger5@example.com`
	const strangerInvite = toCreatedInvite(
		await createUserInvite(sender.id, { topicId: topic.id }, { email: strangerAddress }),
		"the stranger email invite",
	)
	const strangerRow = await loadInvite(strangerInvite.id)
	assert.equal(strangerRow.email, strangerAddress, "the stranger email invite dropped the address")
	assert.equal(strangerRow.invitedUserId, null, "the stranger email invite resolved a phantom account")

	// a username invite for a person holding a declined email row reopens that row instead of inserting a second
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
	assert.equal(reopened.id, declinedRow.id, "the re-invite inserted a second row instead of reopening")
	assert.equal((await loadInvite(declinedRow.id)).declinedAt, null, "the reopened row kept its declined time")
	// still exactly one row for this person on the topic
	const slotRows = await db
		.select()
		.from(invites)
		.where(and(eq(invites.topicId, topic.id), eq(invites.email, declined.email)))
	assert.equal(slotRows.length, 1, "the person holds more than one slot on the topic")
	console.log("PASS  each mode stores what it resolved, and a declined row reopens as the one slot")
}

// 6. each invite-access setting: nobody refuses every sender, connected admits only a connected one, anyone admits a stranger
async function checkInviteAccess(): Promise<void> {
	console.log("\n=== 6. invite-access ===")
	// a stranger sender, a teammate sender, and one recipient per setting
	const strangerSender = await createUser("strangersender6")
	const strangerTopic = await createTopic(strangerSender.id, "stranger sender topic")
	const teammateSender = await createUser("teammatesender6")
	const teammateTopic = await createTopic(teammateSender.id, "teammate sender topic")
	const refusesAll = await createUser("nobody6", { inviteAccess: "nobody" })
	const connectedOnly = await createUser("connected6", { inviteAccess: "connected" })
	const admitsAll = await createUser("anyone6", { inviteAccess: "anyone" })

	// the teammate sender shares a team with both guarded recipients
	const team = await createTeam("setting team", teammateSender.id)
	await db.insert(teamMembers).values([
		{ teamId: team.id, userId: refusesAll.id },
		{ teamId: team.id, userId: connectedOnly.id },
	])

	// nobody refuses the stranger and the teammate alike
	assert.equal(
		await createUserInvite(strangerSender.id, { topicId: strangerTopic.id }, { username: refusesAll.username }),
		"not-accepting",
		"a nobody recipient admitted a stranger",
	)
	assert.equal(
		await createUserInvite(teammateSender.id, { topicId: teammateTopic.id }, { username: refusesAll.username }),
		"not-accepting",
		"a nobody recipient admitted a teammate",
	)

	// connected refuses the stranger and admits the sender who shares a team
	assert.equal(
		await createUserInvite(strangerSender.id, { topicId: strangerTopic.id }, { username: connectedOnly.username }),
		"not-accepting",
		"a connected-only recipient admitted a stranger",
	)
	toCreatedInvite(
		await createUserInvite(teammateSender.id, { topicId: teammateTopic.id }, { username: connectedOnly.username }),
		"the teammate's invite to a connected-only recipient",
	)

	// anyone admits the stranger
	toCreatedInvite(
		await createUserInvite(strangerSender.id, { topicId: strangerTopic.id }, { username: admitsAll.username }),
		"the stranger's invite to an anyone recipient",
	)
	console.log("PASS  nobody refuses everyone, connected admits only a connected sender, anyone admits a stranger")
}

// 7. what counts as connected: a shared team, an active subscription, and an accepted invitation, but never two strangers
async function checkIsConnected(): Promise<void> {
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

	// total strangers never connect
	const strangerA = await createUser("strangera7")
	const strangerB = await createUser("strangerb7")
	assert.equal(await isConnected(strangerA.id, strangerB.id), false, "two strangers connect")
	console.log("PASS  a shared team, an active subscription, and an accepted invitation connect, strangers do not")
}

// 8. accepting works the same by token or by row, and a declined invitation can no longer be answered
async function checkAcceptAndDecline(): Promise<void> {
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

	// accepting a username team invite writes the membership and a muted subscription per held topic
	const teamInvite = await insertInvite({ teamId: team.id, invitedUserId: recipient.id, invitedByUserId: sender.id })
	const teamOutcome = await acceptInvite(recipient.id, teamInvite.id)
	assert.equal(teamOutcome.status, "joinedTeam", `the team acceptance answered ${teamOutcome.status}`)
	// the membership row, then the muted subscription the join fanned out on the held topic
	const [membership] = await db
		.select()
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, recipient.id)))
	assert.equal(membership?.role, "member", "the team acceptance wrote no membership")
	const teamSubscription = await loadSubscription(recipient.id, teamTopic.id)
	assert.equal(teamSubscription?.isActive, true, "the join fanned out no subscription on the held topic")
	assert.equal(teamSubscription?.isEmailEnabled, false, "the fanned-out subscription is not muted")

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

// 9. the daily count ignores username invites and counts email rows, held to the computed limit
async function checkDailyCount(): Promise<void> {
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

// the users row one label seeds, shared by the single and batch inserts
function toUserValues(
	label: string,
	options: { inviteAccess?: (typeof users.$inferSelect)["inviteAccess"]; isFresh?: boolean } = {},
): typeof users.$inferInsert {
	// the run id keeps the email and username unique, and the normalized form lets invites resolve them
	const username = `${runId}-${label}`
	return {
		name: label,
		email: `${runId}-${label}@example.com`,
		username,
		usernameNormalized: toNormalizedUsername(username),
		inviteAccess: options.inviteAccess ?? "anyone",
		createdAt: options.isFresh ? new Date() : BACKDATED_CREATED_AT,
	}
}

// insert one account and remember it for cleanup
async function createUser(
	label: string,
	options: { inviteAccess?: (typeof users.$inferSelect)["inviteAccess"]; isFresh?: boolean } = {},
): Promise<typeof users.$inferSelect> {
	// the row, failed loud. every section builds on its fixtures
	const [user] = await db.insert(users).values(toUserValues(label, options)).returning()
	if (!user) {
		throw new Error(`could not seed the ${label} account`)
	}
	// remembered so cleanup deletes it whichever way the run ends
	createdUserIds.push(user.id)
	return user
}

// insert one topic. deleting its owner cascades it away with its invites and subscriptions
async function createTopic(ownerId: string, name: string, teamId?: string): Promise<typeof topics.$inferSelect> {
	const [topic] = await db.insert(topics).values({ ownerId, name, teamId }).returning()
	if (!topic) {
		throw new Error(`could not seed the topic ${name}`)
	}
	return topic
}

// insert one team with its leader membership. teams have no owner cascade, so their ids are kept for cleanup
async function createTeam(label: string, leaderUserId: string): Promise<typeof teams.$inferSelect> {
	// the team row, named with the run id to keep team names unique
	const [team] = await db
		.insert(teams)
		.values({ name: `${runId} ${label}` })
		.returning()
	if (!team) {
		throw new Error(`could not seed the team ${label}`)
	}
	// the leader membership, and the id remembered for cleanup
	createdTeamIds.push(team.id)
	await db.insert(teamMembers).values({ teamId: team.id, userId: leaderUserId, role: "leader" })
	return team
}

// insert one invite row directly, for the sections that exercise acceptance instead of creation
async function insertInvite(values: typeof invites.$inferInsert): Promise<typeof invites.$inferSelect> {
	const [invite] = await db.insert(invites).values(values).returning()
	if (!invite) {
		throw new Error("could not seed an invite")
	}
	return invite
}

// reload one invite row, for the assertions that read what a call saved or spent
async function loadInvite(inviteId: string): Promise<typeof invites.$inferSelect> {
	const [invite] = await db.select().from(invites).where(eq(invites.id, inviteId))
	if (!invite) {
		throw new Error(`the invite ${inviteId} disappeared mid-run`)
	}
	return invite
}

// the user's subscription row on a topic, or undefined when none was written
async function loadSubscription(
	userId: string,
	topicId: string,
): Promise<typeof subscriptions.$inferSelect | undefined> {
	const [subscription] = await db
		.select()
		.from(subscriptions)
		.where(and(eq(subscriptions.topicId, topicId), eq(subscriptions.subscriberUserId, userId)))
	return subscription
}

// narrow a creation answer to the invite it should be, throwing the refusal it was instead
function toCreatedInvite(created: Invite | UserInviteRefusal, label: string): Invite {
	if (typeof created === "string") {
		throw new Error(`${label} answered ${created} instead of an invite`)
	}
	return created
}

// delete everything this run created. teams have no owner cascade, so they go before the accounts
async function cleanup(): Promise<void> {
	// the teams first, cascading their memberships and team invites
	if (createdTeamIds.length > 0) {
		await db.delete(teams).where(inArray(teams.id, createdTeamIds))
	}
	// the accounts last, cascading their topics with every invite and subscription on them
	if (createdUserIds.length > 0) {
		await db.delete(users).where(inArray(users.id, createdUserIds))
	}
}

// run every section in order, clean the fixtures up whichever way the run ends, and exit loud on a failure
let exitCode = 0
try {
	// the creation and acceptance sections first
	await checkLinkCreateAuthority()
	await checkValidAcceptance()
	await checkUseLimitRace()
	await checkTeamLimitRefund()
	// then resolution, the invite-access setting, connections, accepting and declining, and the daily count
	await checkResolution()
	await checkInviteAccess()
	await checkIsConnected()
	await checkAcceptAndDecline()
	await checkDailyCount()
	// reaching here means every assert held
	console.log("\n=== invite smoke PASSED ===")
} catch (error) {
	// the failure prints whole, so the assert message names what broke
	console.error("\n=== invite smoke FAILED ===")
	console.error(error)
	exitCode = 1
} finally {
	// the fixtures go, then the pool closes so the process can exit on its own
	await cleanup()
	await connectionPool.end()
}
process.exit(exitCode)
