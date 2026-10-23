// the invented users the admin console lists: the users table's signed-in admin and three users, and a topic's
// subscribers
import type { AdminTopicSubscriberRow, AdminUserRow } from "@carlnotes/contracts/admin"
import { DAY_MS } from "@carlnotes/contracts/time"
import { FIXTURE_DATE, STORY_ADMIN, STORY_PEOPLE, toStoryEmail } from "../fixtures"

// the story people the users table lists beside the admin
const [VIENNA, CARLOS, EVAN] = STORY_PEOPLE

/** The signed-in admin's own row, on the premium plan with no budget override. */
export const SIGNED_IN_ADMIN_ROW = toAdminUserRow({
	id: STORY_ADMIN.userId,
	username: STORY_ADMIN.username,
	role: "admin",
	plan: "premium",
	topicCount: 4,
	teamCount: 2,
	attributedBytes: 52_428_800,
	scanSpendCents: 1240,
	chatSpendCents: 310,
	monthVariableCostCents: 1550,
	budgetCents: 5000,
})

/** A user on the plus plan, under budget, with topics and a team to open. */
export const PLUS_USER_ROW = toAdminUserRow({
	id: VIENNA.userId,
	username: VIENNA.username,
	plan: "plus",
	topicCount: 3,
	teamCount: 1,
	attributedBytes: 8_388_608,
	scanSpendCents: 820,
	chatSpendCents: 145,
	monthVariableCostCents: 965,
	budgetCents: 1000,
})

/** A free user past their budget, with no recorded sign-in. */
export const OVER_BUDGET_USER_ROW = toAdminUserRow({
	id: CARLOS.userId,
	username: CARLOS.username,
	lastLoginAt: null,
	topicCount: 1,
	attributedBytes: 1_048_576,
	scanSpendCents: 210,
	chatSpendCents: 95,
	monthVariableCostCents: 305,
	budgetCents: 200,
})

/** A free user with a budget override, no topics or teams, and no cost while the proxy is unreachable. */
export const BUDGET_OVERRIDE_USER_ROW = toAdminUserRow({
	id: EVAN.userId,
	username: EVAN.username,
	monthVariableCostCents: null,
	budgetOverrideCents: 1500,
	budgetCents: 1500,
})

/** The admin console's users, the signed-in admin first. */
export const ADMIN_USER_ROW_FIXTURES: AdminUserRow[] = [
	SIGNED_IN_ADMIN_ROW,
	PLUS_USER_ROW,
	OVER_BUDGET_USER_ROW,
	BUDGET_OVERRIDE_USER_ROW,
]

/**
 * A topic's subscribers in the admin console: the story people, newest first, one with the topic's emails off and one
 * with no recorded login.
 */
export const TOPIC_SUBSCRIBER_FIXTURES: AdminTopicSubscriberRow[] = STORY_PEOPLE.map((storyPerson, i) => ({
	userId: storyPerson.userId,
	username: storyPerson.username,
	avatarVersion: null,
	email: toStoryEmail(storyPerson.username),
	plan: i === 0 ? "plus" : "free",
	signedUpAt: new Date(FIXTURE_DATE.getTime() - (30 + i) * DAY_MS).toISOString(),
	lastLoginAt: i === 2 ? null : new Date(FIXTURE_DATE.getTime() - i * DAY_MS).toISOString(),
	subscribedAt: new Date(FIXTURE_DATE.getTime() - i * DAY_MS).toISOString(),
	isEmailEnabled: i !== 1,
	emailCount: [4, 0, 2][i] ?? 0,
	lastEmailedAt: i === 1 ? null : new Date(FIXTURE_DATE.getTime() - (i + 1) * DAY_MS).toISOString(),
}))

// an admin console user row: a free user who signed up and last signed in on the fixture date, with no spend, unless
// the overrides say otherwise
function toAdminUserRow(overrides: Partial<AdminUserRow> & Pick<AdminUserRow, "id" | "username">): AdminUserRow {
	return {
		email: toStoryEmail(overrides.username),
		avatarSource: "generated",
		avatarVersion: null,
		role: "user",
		plan: "free",
		createdAt: FIXTURE_DATE.toISOString(),
		lastLoginAt: FIXTURE_DATE.toISOString(),
		topicCount: 0,
		teamCount: 0,
		attributedBytes: 0,
		scanSpendCents: 0,
		chatSpendCents: 0,
		monthVariableCostCents: 0,
		budgetOverrideCents: null,
		budgetCents: 200,
		...overrides,
	}
}
