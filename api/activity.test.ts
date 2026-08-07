// activity tests for the payload assembly: cents conversion, the per-topic grouping with its sums,
// and the subscription dedupe that decides which rows the user can edit
import { expect, test } from "bun:test"
import { toActivityTopics, toCents, toSubscriptionRows } from "./activity"

// scans.cost is a numeric dollars string, converted once for every spend figure on the page
test("toCents converts the dollars string and zeroes malformed values", () => {
	expect(toCents("0.123456")).toBe(12)
	expect(toCents("1.20")).toBe(120)
	expect(toCents(null)).toBe(0)
	expect(toCents("not a number")).toBe(0)
})

// each owned topic carries its month scan count, cost sum, and drill-down rows
test("toActivityTopics groups scans per topic and sums their cents", () => {
	const topicRows = [
		{
			id: "t1",
			name: "Agents",
			visibility: "public" as const,
			frequency: "daily" as const,
			createdAt: new Date("2026-07-01T00:00:00Z"),
			updatedAt: new Date("2026-07-20T00:00:00Z"),
		},
		{
			id: "t2",
			name: "Quiet",
			visibility: "private" as const,
			frequency: "weekly" as const,
			createdAt: new Date("2026-07-02T00:00:00Z"),
			updatedAt: new Date("2026-07-02T00:00:00Z"),
		},
	]
	const scanRows = [
		{
			id: "s1",
			topicId: "t1",
			status: "succeeded" as const,
			error: null,
			startedAt: new Date("2026-07-21T00:00:00Z"),
			finishedAt: new Date("2026-07-21T00:02:00Z"),
			foundCount: 12,
			keptCount: 3,
			costDollars: "0.10",
			scanSummary: "Found a few things.",
		},
		// a still-running scan carries no finish time or recap yet
		{
			id: "s2",
			topicId: "t1",
			status: "running" as const,
			error: null,
			startedAt: new Date("2026-07-22T00:00:00Z"),
			finishedAt: null,
			foundCount: 4,
			keptCount: 1,
			costDollars: "0.25",
			scanSummary: null,
		},
	]
	// only the first topic has subscribers, so the second proves a missing count reads as zero
	const [agents, quiet] = toActivityTopics(topicRows, scanRows, new Map([["t1", 3]]))

	// the topic with scans counts them and sums their cost in cents
	expect(agents?.monthScanCount).toBe(2)
	expect(agents?.subscriberCount).toBe(3)
	expect(quiet?.subscriberCount).toBe(0)
	expect(agents?.monthCostCents).toBe(35)
	expect(agents?.scans.map((scan) => scan.costCents)).toEqual([10, 25])
	expect(agents?.scans.map((scan) => scan.foundCount)).toEqual([12, 4])

	// finishedAt converts to an iso string when it's set and passes null through otherwise
	expect(agents?.scans[0]?.finishedAt).toBe("2026-07-21T00:02:00.000Z")
	expect(agents?.scans[1]?.finishedAt).toBeNull()
	expect(agents?.scans[1]?.scanSummary).toBeNull()

	// a topic with no scans this month still appears, with zeroes
	expect(quiet?.monthScanCount).toBe(0)
	expect(quiet?.monthCostCents).toBe(0)
	expect(quiet?.scans).toEqual([])
})

// a subscription row with an optional audience name
function subscriptionRow(
	topicId: string,
	audienceName: string | null,
): Parameters<typeof toSubscriptionRows>[0][number] {
	return {
		topicId,
		name: `topic ${topicId}`,
		ownerName: "Owner",
		visibility: "public",
		subscribedAt: new Date("2026-07-01T00:00:00Z"),
		isActive: true,
		isEmailEnabled: true,
		audienceName,
	}
}

// a user can reach one topic both ways. the direct row is the only one their controls can write, so it must win
test("toSubscriptionRows keeps the direct row over an audience-held one", () => {
	// audience subscriber first, then direct subscriber: the later direct subscriber row displaces it
	const audienceFirstSubscriptions = toSubscriptionRows([subscriptionRow("t1", "Team"), subscriptionRow("t1", null)])
	expect(audienceFirstSubscriptions).toHaveLength(1)
	expect(audienceFirstSubscriptions[0]?.audienceName).toBeNull()

	// direct subscriber first, then audience subscriber: the audience subscriber row must not displace the direct subscriber one
	const directFirstSubscriptions = toSubscriptionRows([subscriptionRow("t1", null), subscriptionRow("t1", "Team")])
	expect(directFirstSubscriptions).toHaveLength(1)
	expect(directFirstSubscriptions[0]?.audienceName).toBeNull()
})

// an audience-only subscription keeps its audience name, which is what renders the row read-only
test("toSubscriptionRows keeps the audience name when there is no direct row", () => {
	const subscriptionRows = toSubscriptionRows([subscriptionRow("t1", "Team"), subscriptionRow("t2", null)])
	expect(subscriptionRows).toHaveLength(2)
	expect(subscriptionRows.find((subscriptionRow) => subscriptionRow.topicId === "t1")?.audienceName).toBe("Team")
	expect(subscriptionRows.find((subscriptionRow) => subscriptionRow.topicId === "t2")?.audienceName).toBeNull()
})

// the dates serialize to strings for a JSON payload
test("toSubscriptionRows serializes the subscribed date", () => {
	const [row] = toSubscriptionRows([subscriptionRow("t1", null)])
	expect(row?.subscribedAt).toBe("2026-07-01T00:00:00.000Z")
})
