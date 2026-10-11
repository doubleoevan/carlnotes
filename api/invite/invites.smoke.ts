// a live smoke test for the invite lifecycle and deleted at the end.
// run it with: doppler run -- bun api/invite/invites.smoke.ts. needs Doppler secrets
import { connectionPool } from "../../db"
import {
	checkLinkCreateAuthority,
	checkSpentAndReusedLinks,
	checkTeamLimitRefund,
	checkUseLimitRace,
	checkValidAcceptance,
} from "./inviteLinkSmokeSections"
import { cleanup } from "./inviteSmokeFixtures"
import {
	checkAcceptAndDecline,
	checkDailyCount,
	checkInviteAccess,
	checkIsConnected,
	checkResolution,
	checkSentInviteAvatarVersions,
} from "./userInviteSmokeSections"

// these keys are dropped before any invite call runs
delete Bun.env.RESEND_API_KEY
delete Bun.env.POSTHOG_API_KEY
delete Bun.env.BETTER_AUTH_URL

// run every section in order, clean the fixtures up whichever way the run ends, and exit loud on a failure
let exitCode = 0
try {
	// the creation and acceptance sections first
	await checkLinkCreateAuthority()
	await checkValidAcceptance()
	await checkUseLimitRace()
	await checkTeamLimitRefund()
	await checkSpentAndReusedLinks()
	// then resolution, the invite-access setting, connections, accepting and declining, the daily count,
	// and each sent invite's avatar version
	await checkResolution()
	await checkInviteAccess()
	await checkIsConnected()
	await checkAcceptAndDecline()
	await checkDailyCount()
	await checkSentInviteAvatarVersions()
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
process.exitCode = exitCode
