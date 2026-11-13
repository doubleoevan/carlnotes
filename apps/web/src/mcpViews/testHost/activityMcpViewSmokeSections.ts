// the activity MCP view through the test host: its two tables, a subscription's switch through follow_topic, a pending
// invite's accept and delete through respond_to_invite, and a topic's link to its page on the site
import { expect, test } from "bun:test"
import type { ActivityResponse } from "@carlnotes/contracts/activity"
import { TEST_SUBSCRIPTIONS, TEST_TOPIC_INVITES } from "@carlnotes/contracts/activityTestFixtures"
import { SPEND_METER_STORY_ACTIVITY } from "@carlnotes/core/lib/spendMeterStoryFixtures"
import type { McpViewToolResult } from "../mcpViewHost"
import { toMcpViewToolResult, USER_MCP_VIEW_DATA } from "./mcpViewFixtures"
import { waitForRecord, withMcpView } from "./mcpViewTestHarness"
import { type OpenMcpViewOptions, TEST_SITE_URL, type ToolCallResponder } from "./mcpViewTestHost"

// the caller's activity with its spend: a followed team topic, a follow switched off, a pending invite, and three
// sent invites
const ACTIVITY: ActivityResponse = {
	...SPEND_METER_STORY_ACTIVITY,
	user: { userId: "user-1", username: "vienna", avatarSource: null, avatarVersion: null },
	topics: [],
	subscriptions: TEST_SUBSCRIPTIONS,
	invites: TEST_TOPIC_INVITES,
}

/**
 * Returns a read_activity result that holds the caller's activity.
 */
export function toActivityToolResult(activity: ActivityResponse = ACTIVITY): McpViewToolResult {
	return toMcpViewToolResult({ mcpViewData: { ...USER_MCP_VIEW_DATA, activity: { activity } } })
}

// the host's reply to a write, and to the read that follows it
const respondToActivityToolCall: ToolCallResponder = ({ name }) =>
	name === "read_activity" ? toActivityToolResult() : { content: [{ type: "text", text: "Saved." }] }
const ACTIVITY_OPTIONS: OpenMcpViewOptions = { mcpView: "activity", respondToToolCall: respondToActivityToolCall }

test("the activity MCP view shows both tables with no Emails column and no subscription delete", async () => {
	await withMcpView({ mcpView: "activity" }, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toActivityToolResult())
		await frame.getByText("Topics you follow").waitFor()
		await frame.getByText("Your topic invites").waitFor()
		await frame.getByRole("switch", { name: "Follow Design systems" }).waitFor()

		// the controls with no tool stay out, and the view reads nothing on load
		expect(await frame.getByText("Emails", { exact: true }).count()).toBe(0)
		expect(await frame.getByRole("button", { name: /^Unfollow / }).count()).toBe(0)
		expect(await frame.getByRole("button", { name: /^Withdraw/ }).count()).toBe(0)
		expect(toolCalls).toEqual([])
	})
})

test("a subscription's switch calls follow_topic, then reads the activity again", async () => {
	await withMcpView(ACTIVITY_OPTIONS, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toActivityToolResult())
		await frame.getByRole("switch", { name: "Follow Design systems" }).click()
		await waitForRecord(toolCalls, 2)
		expect(toolCalls).toEqual([
			{ name: "follow_topic", arguments: { topic_id: "topic-design-systems", is_following: false } },
			{ name: "read_activity", arguments: {} },
		])
	})
})

test("a pending invite's switch accepts it and its delete declines it through respond_to_invite", async () => {
	await withMcpView(ACTIVITY_OPTIONS, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toActivityToolResult())

		// the switch accepts the invite
		await frame.getByRole("switch", { name: "Accept the invite to Home espresso" }).click()
		await waitForRecord(toolCalls, 2)
		expect(toolCalls[0]).toEqual({
			name: "respond_to_invite",
			arguments: { invite_id: "invite-home-espresso", is_accepted: true },
		})

		// the delete declines it after its confirmation
		await frame.getByRole("button", { name: "Delete the invite to Home espresso" }).click()
		await frame.getByRole("button", { name: "Delete invite" }).click()
		await waitForRecord(toolCalls, 4)
		expect(toolCalls[2]).toEqual({
			name: "respond_to_invite",
			arguments: { invite_id: "invite-home-espresso", is_accepted: false },
		})
	})
})

test("a followed topic's name opens its page on the site", async () => {
	await withMcpView({ mcpView: "activity" }, async ({ frame, links, sendToolResult }) => {
		await sendToolResult(toActivityToolResult())
		await frame.getByRole("link", { name: "Design systems" }).first().click()
		await waitForRecord(links)
		expect(links[0]).toStartWith(`${TEST_SITE_URL}/topics/topic-design-systems`)
	})
})
