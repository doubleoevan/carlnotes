// a live smoke test for the team lifecycle
// run it with: doppler run -- bun api/team/teams.smoke.ts. needs Doppler secrets
import { connectionPool } from "../../db"
import {
	checkCreateTeam,
	checkJoinFanOut,
	checkJoinRequests,
	checkLastLeaderRule,
	checkMemberLimit,
	checkUnsubscribeKeepsAccess,
} from "./teamMembershipSmokeSections"
import { checkInviteIdentities, checkTeamPageGate } from "./teamPageSmokeSections"
import { cleanUpFixtures, seedFixtures } from "./teamSmokeFixtures"
import {
	checkRemoveDeactivation,
	checkRemoveSuccession,
	checkTeamDeletion,
	checkTopicRoleMatrix,
} from "./teamTopicSmokeSections"

// seed, run the scenarios in order, and always delete what the run created
async function smokeTest(): Promise<number> {
	// the ids createTeam makes, collected so cleanup can delete them beside the seeded teams
	const createdTeamIds: string[] = []
	try {
		await seedFixtures()
		// creation and membership: the create path, the join fan-out, and the boundaries on both
		await checkCreateTeam(createdTeamIds)
		await checkJoinFanOut()
		await checkUnsubscribeKeepsAccess()
		await checkMemberLimit()
		await checkLastLeaderRule()
		// the held topics: deletion, detachment, and the role results built on what remains
		await checkTeamDeletion()
		await checkRemoveSuccession()
		await checkRemoveDeactivation()
		await checkTopicRoleMatrix()
		await checkJoinRequests()
		// the team page and the gate a private team shows a non-member
		await checkTeamPageGate()
		// the sender that an invite names and the inviter that a membership names
		await checkInviteIdentities()
		// every check passed
		console.log("\n=== smoke PASSED ===")
		return 0
	} catch (error) {
		// the first failed check is caught and printed here, with the cleanup still running after it
		console.error(error)
		console.log("\n=== smoke FAILED ===")
		return 1
	} finally {
		await cleanUpFixtures(createdTeamIds)
	}
}

// run the smoke test, then close the pool so the process exits on its own
const exitCode = await smokeTest()
await connectionPool.end()
process.exitCode = exitCode
