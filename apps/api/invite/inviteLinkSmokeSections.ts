// the invite smoke's link sections: creating a link, accepting one, the use-limit race, link reuse, a link shared from
// a Topic Post, and the refund
import assert from "node:assert/strict"
import { PLANS } from "@carlnotes/contracts/plans"
import { db } from "@carlnotes/db"
import { teamMembers } from "@carlnotes/db/schema/teams"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { subscriptions, topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { and, eq } from "drizzle-orm"
import { TEST_ANALYTICS_PROPERTIES } from "../analyticsTestFixtures"
import { acceptInviteToken, toInviteRejection } from "./inviteAcceptance"
import {
	createdUserIds,
	createTeam,
	createTopic,
	createUser,
	insertInvite,
	loadInvite,
	loadSubscription,
	toCreatedInvite,
	toUserValues,
} from "./inviteSmokeFixtures"
import { createTeamInvite, createTopicInvite } from "./invites"

// the free plan's team member limit, which these fills sit exactly at
const FREE_TEAM_MEMBER_LIMIT = PLANS.free.teamMemberLimit ?? 0

/** 1. Only edit authority creates a link, and a fresh one is live. */
export async function checkLinkCreateAuthority(): Promise<void> {
	console.log("\n=== 1. link create authority ===")
	// an owner with a topic, and another user with no access to it
	const owner = await createUser("owner1")
	const otherUser = await createUser("otheruser1")
	const topic = await createTopic(owner.id, "link authority topic")

	// the other user is rejected, and the owner gets a live link with the link limits
	assert.equal(
		await createTopicInvite(otherUser.id, topic.id, "copy-link", TEST_ANALYTICS_PROPERTIES),
		"forbidden",
		"a non-owner created a link",
	)
	const created = toCreatedInvite(
		await createTopicInvite(owner.id, topic.id, "copy-link", TEST_ANALYTICS_PROPERTIES),
		"the owner's link",
	)
	assert.equal(created.maxUses, 25, "the owner's link does not have the link use limit")
	assert.equal(toInviteRejection(await loadInvite(created.id), new Date()), null, "the fresh link is not live")

	console.log("PASS  the other user is rejected and the owner's link lives")

	// a team link is a member's power the same way, and a non-member is rejected
	const team = await createTeam("authority team", owner.id)
	assert.equal(
		await createTeamInvite(otherUser.id, team.id, "copy-link", TEST_ANALYTICS_PROPERTIES),
		"forbidden",
		"a non-member created a team link",
	)
	console.log("PASS  a non-member cannot create a team link")
}

/** 2. A valid acceptance subscribes the accepter and spends one use, and arriving again spends nothing. */
export async function checkValidAcceptance(): Promise<void> {
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

/** 3. Four concurrent accepters race a two-use link, and the conditional spend admits exactly two. */
export async function checkUseLimitRace(): Promise<void> {
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

/** 3b. Link reuse, the public-topic waiver, and a dead team link landing as a join request. */
export async function checkSpentAndReusedLinks(): Promise<void> {
	console.log("\n=== 3b. growth paths ===")
	// creating twice returns the same live link instead of creating a secondInvite bearer token
	const owner = await createUser("owner3b")
	const topic = await createTopic(owner.id, "growth topic")
	const firstInvite = toCreatedInvite(
		await createTopicInvite(owner.id, topic.id, "copy-link", TEST_ANALYTICS_PROPERTIES),
		"the first link",
	)
	const secondInvite = toCreatedInvite(
		await createTopicInvite(owner.id, topic.id, "copy-link", TEST_ANALYTICS_PROPERTIES),
		"the reuse",
	)
	assert.equal(
		secondInvite.id,
		firstInvite.id,
		"a secondInvite create wrote a new link instead of returning the live one",
	)
	console.log("PASS  creating twice returns the same live link")

	// an exhausted link to a public topic still admits, since Follow grants the same subscription
	await db.update(topics).set({ visibility: "public" }).where(eq(topics.id, topic.id))
	const spentInvite = await insertInvite({ topicId: topic.id, invitedByUserId: owner.id, maxUses: 1, usedCount: 1 })
	const lateAccepter = await createUser("late3b")
	const lateOutcome = await acceptInviteToken(lateAccepter.id, spentInvite.token)
	assert.equal(lateOutcome.status, "joined", `the public topic's spent link answered ${lateOutcome.status}`)
	console.log("PASS  a spent link to a public topic still joins")

	// an exhausted team link lands as a join request instead of a dead end
	const team = await createTeam("growth team", owner.id)
	const spentTeamInvite = await insertInvite({ teamId: team.id, invitedByUserId: owner.id, maxUses: 1, usedCount: 1 })
	const requester = await createUser("requester3b")
	const requestOutcome = await acceptInviteToken(requester.id, spentTeamInvite.token)
	assert.equal(requestOutcome.status, "requestedTeam", `the spent team link answered ${requestOutcome.status}`)

	// the join request is a waiting membership row, not an active one
	const [requestRow] = await db
		.select({ isActive: teamMembers.isActive })
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, requester.id)))
	assert.equal(requestRow?.isActive, false, "the spent team link wrote no waiting membership row")
	console.log("PASS  a spent team link lands as a join request a leader can activate")
}

/** 3c. A link shared from a Topic Post names the post, opens it once accepted, and opens the topic once it is gone. */
export async function checkTopicPostLink(): Promise<void> {
	console.log("\n=== 3c. a link shared from a topic post ===")
	// an invite topic with a published post and a draft, and another topic's published post
	const owner = await createUser("owner3c")
	const topic = await createTopic(owner.id, "post link topic")
	const otherTopic = await createTopic(owner.id, "other post link topic")
	await db.update(topics).set({ visibility: "invite" }).where(eq(topics.id, topic.id))
	const [topicPost, draftTopicPost, otherTopicPost] = await db
		.insert(topicPosts)
		.values([
			{ topicId: topic.id, authorUserId: owner.id, title: "Smoke Post", publishedAt: new Date() },
			{ topicId: topic.id, authorUserId: owner.id, title: "Smoke Draft" },
			{ topicId: otherTopic.id, authorUserId: owner.id, title: "Other Post", publishedAt: new Date() },
		])
		.returning()
	assert.ok(topicPost && draftTopicPost && otherTopicPost, "the topic posts were not seeded")

	// a draft and another topic's post are rejected
	const createLink = (topicPostId?: string): ReturnType<typeof createTopicInvite> =>
		createTopicInvite(owner.id, topic.id, "share-sheet", TEST_ANALYTICS_PROPERTIES, topicPostId)
	assert.equal(await createLink(draftTopicPost.id), "unknown-topic-post", "a draft got a link")
	assert.equal(await createLink(otherTopicPost.id), "unknown-topic-post", "another topic's post got a link")

	// the post's link is its own row, names the post, and is reused on a second create
	const topicLink = toCreatedInvite(await createLink(), "the topic's own link")
	const topicPostLink = toCreatedInvite(await createLink(topicPost.id), "the post's link")
	assert.notEqual(topicPostLink.id, topicLink.id, "the post's link reused the topic's own")
	assert.equal((await loadInvite(topicPostLink.id)).topicPostId, topicPost.id, "the link does not name the post")
	assert.equal(toCreatedInvite(await createLink(topicPost.id), "the reuse").id, topicPostLink.id, "no reuse")
	console.log("PASS  only a published post of the topic gets a link, apart from the topic's own, and it is reused")

	// accepting subscribes to the topic and returns the post's page
	const accepter = await createUser("accepter3c")
	const acceptance = await acceptInviteToken(accepter.id, topicPostLink.token)
	assert.equal(acceptance.status, "joined", `the post's link answered ${acceptance.status}`)
	assert.equal((await loadSubscription(accepter.id, topic.id))?.isActive, true, "the post's link did not subscribe")
	assert.equal(acceptance.status === "joined" && acceptance.topicPost?.id, topicPost.id, "the post was not returned")

	// a deleted post clears the link's post, and the same link then opens the topic alone
	await db.delete(topicPosts).where(eq(topicPosts.id, topicPost.id))
	assert.equal((await loadInvite(topicPostLink.id)).topicPostId, null, "the deleted post stayed on the link")
	const lateAccepter = await createUser("late3c")
	const lateAcceptance = await acceptInviteToken(lateAccepter.id, topicPostLink.token)
	assert.equal(lateAcceptance.status, "joined", `the link answered ${lateAcceptance.status} after the delete`)
	assert.equal(lateAcceptance.status === "joined" && lateAcceptance.topicPost, undefined, "a deleted post was returned")
	console.log("PASS  accepting opens the post, and the topic once the post is gone")
}

/** 4. A team at its member limit rejects the link acceptance and refunds the spent use. */
export async function checkTeamLimitRefund(): Promise<void> {
	console.log("\n=== 4. team-limit refund ===")
	// a free-plan leader's team filled to the free plan's member limit
	const leader = await createUser("leader4")
	const team = await createTeam("limit team", leader.id)
	const fillers = await db
		.insert(users)
		.values(Array.from({ length: FREE_TEAM_MEMBER_LIMIT - 1 }, (_, index) => toUserValues(`filler4-${index}`)))
		.returning()
	createdUserIds.push(...fillers.map((filler) => filler.id))
	await db.insert(teamMembers).values(fillers.map((filler) => ({ teamId: team.id, userId: filler.id })))

	// one person past the limit accepts a live team link and is rejected
	const invite = await insertInvite({ teamId: team.id, invitedByUserId: leader.id, maxUses: 25 })
	const eleventh = await createUser("eleventh4")
	const outcome = await acceptInviteToken(eleventh.id, invite.token)
	assert.equal(outcome.status, "teamFull", `the full team answered ${outcome.status}`)

	// the rejection handed the spent use back and wrote no membership
	assert.equal((await loadInvite(invite.id)).usedCount, 0, "the rejected join kept the spent use")
	const [membership] = await db
		.select()
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, eleventh.id)))
	assert.equal(membership, undefined, "the full team still gained a member")
	console.log("PASS  the full team rejects the link and the spent use is refunded")
}
