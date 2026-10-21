// the team smoke's held-topic sections: team deletion, detach succession and deactivation, and the topic role matrix

import { db } from "@carlnotes/db"
import { teamMembers, teams, teamTopics } from "@carlnotes/db/schema/teams"
import { attachmentExists, uploadAttachment } from "@carlnotes/db/store"
import { and, count, eq } from "drizzle-orm"
import { canSeeTopic, toTopicRole } from "../topic/permissions"
import { deleteTeam } from "./deleteTeam"
import { joinTeam, toTeamRole } from "./members"
import { check, loadSubscription, loadTopic, runId, toId } from "./teamSmokeFixtures"
import { removeTopicFromTeam } from "./teams"

/** 6. Deleting the team returns its owned topic to the creator and drops its share rows. */
export async function checkTeamDeletion(): Promise<void> {
	console.log("\n=== 6. team deletion ===")
	// the team has an avatar image, stored for real, so the delete can be seen to remove it
	const deletedTeamAvatarKey = `avatars/teams/${toId("team-del")}/smoke-${runId}.png`
	await uploadAttachment(deletedTeamAvatarKey, new Uint8Array([137, 80, 78, 71]), "image/png")
	await db
		.update(teams)
		.set({ avatarKey: deletedTeamAvatarKey })
		.where(eq(teams.id, toId("team-del")))

	// a leader alone on the team deletes it outright, and its avatar image is deleted too
	check(
		(await deleteTeam(toId("owner"), toId("team-del"))).status === "deleted",
		"deleteTeam answers deleted for a leader alone on the team",
	)
	check(!(await attachmentExists(deletedTeamAvatarKey)), "the deleted team's avatar image is gone from storage")

	// a team with other members survives: leadership passes to the oldest member and the caller leaves
	const deleteTeamResult = await deleteTeam(toId("limit-leader"), toId("team-limit"))
	check(deleteTeamResult.status === "handedOver", "deleting a populated team hands it over instead")
	const [leaderRow] = await db
		.select({ count: count() })
		.from(teamMembers)
		.where(
			and(eq(teamMembers.teamId, toId("team-limit")), eq(teamMembers.role, "leader"), eq(teamMembers.isActive, true)),
		)
	check((leaderRow?.count ?? 0) === 1, "the surviving team has exactly one leader")
	check((await toTeamRole(toId("limit-leader"), toId("team-limit"))) === null, "the deleting leader left the team")

	// the owned topic returned through the set-null, and the share rows went with the team
	const topic = await loadTopic(toId("topic-del"))
	check(topic.teamId === null, "the owned topic returned to its creator")
	const [shareRow] = await db
		.select({ count: count() })
		.from(teamTopics)
		.where(eq(teamTopics.teamId, toId("team-del")))
	check((shareRow?.count ?? 0) === 0, "the deleted team's share rows are gone")
	// the team itself is gone with them
	const [teamRow] = await db
		.select({ count: count() })
		.from(teams)
		.where(eq(teams.id, toId("team-del")))
	check((teamRow?.count ?? 0) === 0, "the team row is gone")
}

/** 7. When the owning team lets go, the oldest owner-led team with it becomes the owning team. */
export async function checkRemoveSuccession(): Promise<void> {
	console.log("\n=== 7. detach succession ===")
	check(
		await removeTopicFromTeam(toId("owner"), toId("team-detach-a"), toId("topic-detach")),
		"removeTopicFromTeam answers true",
	)

	// the older owner-led team took over, consuming its own share row
	const topic = await loadTopic(toId("topic-detach"))
	check(topic.teamId === toId("team-detach-b"), "the oldest owner-led team with it became the owning team")
	const shareRows = await db
		.select({ teamId: teamTopics.teamId })
		.from(teamTopics)
		.where(eq(teamTopics.topicId, toId("topic-detach")))
	// only the share of the team the owner does not lead remains
	check(shareRows.length === 1, "the successor's share row is consumed")
	check(shareRows[0]?.teamId === toId("team-detach-c"), "the team the owner does not lead keeps only its share")
}

/** 8. Detaching deactivates the departed members' subscriptions, keeping the owner's and any covered member's. */
export async function checkRemoveDeactivation(): Promise<void> {
	console.log("\n=== 8. detach deactivation ===")
	// join both members to the owning team, and the covered one to the other team with it as well
	check(await joinTeam(toId("member-gone"), toId("team-multi-d"), null), "the departing member joins the owning team")
	check(await joinTeam(toId("member-kept"), toId("team-multi-d"), null), "the covered member joins the owning team")
	check(
		await joinTeam(toId("member-kept"), toId("team-multi-e"), null),
		"the covered member joins the other team with it",
	)

	// detach from the owning team. no owner-led team with it remains, so the topic returns to its creator
	check(
		await removeTopicFromTeam(toId("owner"), toId("team-multi-d"), toId("topic-multi")),
		"removeTopicFromTeam answers true",
	)
	const topic = await loadTopic(toId("topic-multi"))
	check(topic.teamId === null, "no team the owner does not lead inherited the topic")

	// the departed member deactivated, the covered member and the owner both kept their subscriptions
	const goneSubscription = await loadSubscription(toId("member-gone"), toId("topic-multi"))
	check(goneSubscription?.isActive === false, "the departed member's subscription deactivated")
	const keptSubscription = await loadSubscription(toId("member-kept"), toId("topic-multi"))
	check(keptSubscription?.isActive === true, "the member covered by another team with it keeps theirs")
	const ownerSubscription = await loadSubscription(toId("owner"), toId("topic-multi"))
	check(ownerSubscription?.isActive === true, "the owner keeps theirs")
}

/** 9. The topic role matrix, and the view gate on a private team topic. */
export async function checkTopicRoleMatrix(): Promise<void> {
	console.log("\n=== 9. toTopicRole matrix ===")
	// the owned team topic and the shared-in one, read fresh
	const ownedTopic = await loadTopic(toId("topic-owned"))
	const sharedTopic = await loadTopic(toId("topic-shared"))

	// the four role outcomes: owner over membership, leader, member, and nothing
	check((await toTopicRole(toId("owner"), ownedTopic)) === "owner", "the owner outranks their team membership")
	check((await toTopicRole(toId("hold-leader"), ownedTopic)) === "leader", "a leader of the owning team answers leader")
	check((await toTopicRole(toId("member"), sharedTopic)) === "member", "a member of a shared-in team answers member")
	check((await toTopicRole(toId("non-member"), ownedTopic)) === null, "a non-member answers null")

	// the private team topic opens to a member and stays closed to a non-member
	check(await canSeeTopic(toId("member"), ownedTopic), "a member sees the private team topic")
	check((await canSeeTopic(toId("non-member"), ownedTopic)) === false, "a non-member never sees it")
}
