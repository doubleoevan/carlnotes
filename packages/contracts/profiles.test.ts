// profile contract tests: a team's status on a profile and the billing state parse as the api writes them, and the
// session's profile identity names the avatar the signed-in user sees
import { expect, test } from "bun:test"
import {
	type BillingState,
	billingState,
	type ProfileTeamStatus,
	profileTeamStatusesResponse,
	toSessionProfileIdentity,
} from "./profiles"

// one team the user leads, with a pending invite to the profile user
const profileTeamStatusesFixture: { teams: ProfileTeamStatus[] } = {
	teams: [
		{
			teamId: "team-1",
			name: "Baristas",
			avatarVersion: null,
			role: "leader",
			status: "invited",
			inviteId: "invite-1",
			canDeleteInvite: true,
		},
	],
}

// a plus subscriber billed yearly
const billingStateFixture: BillingState = {
	plan: "plus",
	billingInterval: "yearly",
	status: "active",
	hasPaymentMethod: true,
	dailyScansUsed: 2,
	dailyScanLimit: 10,
	provider: "stripe",
	isOverageBillable: false,
	revenueCatAppUserId: "revenuecat-user-1",
}

// each payload parses unchanged
test("the profile team statuses response parses the teams", () => {
	expect(profileTeamStatusesResponse.parse(profileTeamStatusesFixture)).toEqual(profileTeamStatusesFixture)
})
test("the billing state parses the plan and its interval", () => {
	expect(billingState.parse(billingStateFixture)).toEqual(billingStateFixture)
})

// the signed-in user's own identity names the upload shown to them alone, and the published avatar with none unchecked
test("the session's profile identity names the user's unchecked avatar over the published one", () => {
	const sessionUser = { id: "user-1", username: "vienna", avatarSource: "upload", avatarKey: "avatars/user-1/3f2a.png" }
	expect(toSessionProfileIdentity(sessionUser).avatarVersion).toBe("3f2a")
	expect(toSessionProfileIdentity({ ...sessionUser, uncheckedAvatarKey: "avatars/user-1/7e8f.png" })).toEqual({
		userId: "user-1",
		username: "vienna",
		avatarSource: "upload",
		avatarVersion: "7e8f",
	})
})
