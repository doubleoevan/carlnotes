// profile contract tests: a team's status on a profile and the billing state parse as the api writes them
import { expect, test } from "bun:test"
import { type BillingState, billingState, type ProfileTeamStatus, profileTeamStatusesResponse } from "./profiles"

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
