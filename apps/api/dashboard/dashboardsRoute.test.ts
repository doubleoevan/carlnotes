// the dashboard route: a visitor reads the public snapshot shared at the edge, the owner reads the full one never
// stored, a team's non-member reads its summary alone, a bad kind, selection, or subject is refused, the read limit
// skips a page render's read, and a page's head holds no private item
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import * as preview from "../share/preview"
import * as teamPageAccess from "../team/teamPageAccess"
import { toSignedInApp } from "../testSession"
import { dashboardsRoute } from "./dashboardsRoute"

// the last completed day the snapshots count, and the public summary's hash
const DAY = "2026-11-10"
const PUBLIC_HASH = "a".repeat(64)

// a public topic's and a private topic's bars
const PUBLIC_BAR = { itemId: "topic-public", title: "Espresso", path: "/topics/topic-public", count: 2 }
const PRIVATE_BAR = { itemId: "topic-private", title: "Secret", path: "/topics/topic-private", count: 1 }

// the person's row in the column order the access check selects, and their identity on the page's byline
const USER_ROW = ["user-1", "vienna", null, null]
const USER_SUBJECT = {
	subjectKind: "user",
	user: { userId: "user-1", username: "vienna", avatarSource: null, avatarVersion: null },
}

// a team as the team page check returns it
const TEAM = { id: "team-1", name: "Roasters", avatarKey: null }

// a series with the bars given
function toSeries(bars: unknown[]): unknown {
	return { bars, slices: [], trends: {}, words: [], pins: [] }
}

// one snapshot row in the column order the read selects
function toSnapshotRow(
	selection: string,
	accessLevel: string,
	body: unknown,
	summaryColumns: unknown[] = [],
): unknown[] {
	const [contentHash = "hash", paragraph = null, imageKey = null] = summaryColumns
	return [selection, accessLevel, DAY, body, contentHash, paragraph, imageKey]
}

// a person's Topic Dashboard: a public and a full summary and topic series, with the person existing
function toTopicDashboardRows({ text }: SentQuery, isFullWritten = true): unknown[] {
	if (text.includes('from "users"')) {
		return [USER_ROW]
	}
	if (!text.includes('from "dashboard_snapshots"')) {
		return []
	}

	// the public rows, and the full rows if the build wrote them
	const publicRows = [
		toSnapshotRow("summary", "public", { dashboardKind: "topicDashboard", topicCount: 1 }, [
			PUBLIC_HASH,
			"Public paragraph.",
			`dashboards/topicDashboard/user-1/${PUBLIC_HASH}.png`,
		]),
		toSnapshotRow("topic", "public", toSeries([PUBLIC_BAR])),
	]
	const fullRows = [
		toSnapshotRow("summary", "full", { dashboardKind: "topicDashboard", topicCount: 2 }, ["hash", "Full paragraph."]),
		toSnapshotRow("topic", "full", toSeries([PUBLIC_BAR, PRIVATE_BAR])),
	]
	return isFullWritten ? [...publicRows, ...fullRows] : publicRows
}

afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
	mock.restore()
})

test("a visitor reads the public snapshot, shared at the edge under the Dashboard's tag", async () => {
	stubRedisClient()
	stubConnectionPool((sentQuery) => toTopicDashboardRows(sentQuery))
	const response = await dashboardsRoute.request("/dashboards/topicDashboard/user-1?itemKind=topic")
	expect(response.status).toBe(200)

	// the public counts, paragraph, image, and bars, and never the private topic
	const dashboard = await response.json()
	expect(dashboard).toMatchObject({
		subject: USER_SUBJECT,
		day: DAY,
		summary: { topicCount: 1 },
		paragraph: "Public paragraph.",
		imageUrl: `/api/dashboards/topicDashboard/user-1/share-image/${PUBLIC_HASH}.png`,
		series: { bars: [PUBLIC_BAR] },
	})
	expect(JSON.stringify(dashboard)).not.toContain("topic-private")

	// the edge caches it under the tag the build purges
	expect(response.headers.get("Cache-Control")).toBe("no-cache")
	expect(response.headers.get("CDN-Cache-Control")).toBe("max-age=86400")
	expect(response.headers.get("Cache-Tag")).toBe("dashboard:topicDashboard:user-1")
})

test("the owner reads the full snapshot, never stored, and falls back to the public one the build left out", async () => {
	stubRedisClient()
	stubConnectionPool((sentQuery) => toTopicDashboardRows(sentQuery))
	const ownerApp = toSignedInApp(dashboardsRoute, "user-1")
	const response = await ownerApp.request("/dashboards/topicDashboard/user-1")

	// the starting selection, topics, with the private topic, and no copy at the edge
	expect(await response.json()).toMatchObject({
		summary: { topicCount: 2 },
		paragraph: "Full paragraph.",
		series: { bars: [PUBLIC_BAR, PRIVATE_BAR] },
	})
	expect(response.headers.get("Cache-Control")).toBe("private, no-store")
	expect(response.headers.get("Cache-Tag")).toBeNull()

	// an owner whose every topic is public reads the public rows
	stubConnectionPool((sentQuery) => toTopicDashboardRows(sentQuery, false))
	const publicOnlyResponse = await ownerApp.request("/dashboards/topicDashboard/user-1")
	expect(await publicOnlyResponse.json()).toMatchObject({ summary: { topicCount: 1 }, series: { bars: [PUBLIC_BAR] } })
})

test("a team's non-member reads its summary alone, and a member reads its charts", async () => {
	stubRedisClient()
	stubConnectionPool(({ text }) =>
		text.includes('from "dashboard_snapshots"')
			? [
					toSnapshotRow("summary", "public", { dashboardKind: "teamDashboard", memberCount: 3 }, ["hash", "Team."]),
					toSnapshotRow("topic", "public", toSeries([PUBLIC_BAR])),
				]
			: [],
	)

	// a non-member of a public team gets the strip with no paragraph and no series
	const accessSpy = spyOn(teamPageAccess, "loadTeamPageAccess").mockResolvedValue({
		team: TEAM,
		canOpen: true,
		role: null,
	} as never)
	const nonMemberResponse = await dashboardsRoute.request("/dashboards/teamDashboard/team-1")
	expect(await nonMemberResponse.json()).toMatchObject({
		subject: { subjectKind: "team", team: { teamId: "team-1", name: "Roasters", avatarVersion: null } },
		summary: { memberCount: 3 },
		paragraph: null,
		series: null,
	})

	// a member gets the charts, never stored
	accessSpy.mockResolvedValue({ team: TEAM, canOpen: true, role: "member" } as never)
	const memberResponse = await toSignedInApp(dashboardsRoute, "user-2").request("/dashboards/teamDashboard/team-1")
	expect(await memberResponse.json()).toMatchObject({ paragraph: "Team.", series: { bars: [PUBLIC_BAR] } })
	expect(memberResponse.headers.get("Cache-Control")).toBe("private, no-store")

	// a private team's page that does not open returns 404
	accessSpy.mockResolvedValue({ team: TEAM, canOpen: false, role: null } as never)
	expect((await dashboardsRoute.request("/dashboards/teamDashboard/team-1")).status).toBe(404)
})

test("an unknown kind on every route, a selection the kind lacks, and a missing person are refused", async () => {
	stubRedisClient()
	stubConnectionPool()

	// an unknown kind fails the path's check on the read, the head, and the share image
	for (const unknownKindPath of ["", "/head", `/share-image/${PUBLIC_HASH}.png`]) {
		expect((await dashboardsRoute.request(`/dashboards/noteDashboard/user-1${unknownKindPath}`)).status).toBe(400)
	}

	// a selection the kind does not offer fails the query's check, and a missing person is not found
	expect((await dashboardsRoute.request("/dashboards/podcastDashboard/user-1?format=topic")).status).toBe(400)
	expect((await dashboardsRoute.request("/dashboards/topicDashboard/user-9")).status).toBe(404)
})

test("the read limit sends no rate limit header and skips a page render's loopback read", async () => {
	const storedValueByKey = stubRedisClient()
	stubConnectionPool((sentQuery) => toTopicDashboardRows(sentQuery))

	// a page render's loopback read sends no cookie and no forwarded address, so nothing is counted
	expect((await dashboardsRoute.request("/dashboards/topicDashboard/user-1")).status).toBe(200)
	expect(storedValueByKey.size).toBe(0)

	// a visitor's read is counted under their address with no rate limit header
	const visitorResponse = await dashboardsRoute.request("/dashboards/topicDashboard/user-1", {
		headers: { "x-forwarded-for": "203.0.113.40" },
	})
	expect(visitorResponse.status).toBe(200)
	expect([...visitorResponse.headers.keys()].some((headerName) => headerName.startsWith("ratelimit"))).toBe(false)
	expect([...storedValueByKey.keys()]).toEqual(["rate-limit:dashboard-read:address:203.0.113.40"])
})

test("a Dashboard not built yet shows zeros", async () => {
	stubRedisClient()
	stubConnectionPool(({ text }) => (text.includes('from "users"') ? [USER_ROW] : []))
	const response = await dashboardsRoute.request("/dashboards/podcastDashboard/user-1?format=audio")
	expect(await response.json()).toEqual({
		subject: USER_SUBJECT,
		day: null,
		summary: {
			dashboardKind: "podcastDashboard",
			podcastCount: 0,
			podcastEpisodeCount: 0,
			podcastPlayCount: 0,
			filmPlayCount: 0,
		},
		paragraph: null,
		imageUrl: null,
		series: null,
	})
})

test("the share image serves only at its current hash", async () => {
	stubConnectionPool(({ text }) =>
		text.includes('from "dashboard_snapshots"')
			? [[`dashboards/topicDashboard/user-1/${PUBLIC_HASH}.png`, PUBLIC_HASH]]
			: [],
	)
	const oldHash = "b".repeat(64)
	expect((await dashboardsRoute.request(`/dashboards/topicDashboard/user-1/share-image/${oldHash}.png`)).status).toBe(
		404,
	)
	expect((await dashboardsRoute.request("/dashboards/topicDashboard/user-1/share-image/x.png")).status).toBe(404)
})

test("a Dashboard page's head reads the public snapshot alone, and a team's head leaves out its paragraph", async () => {
	spyOn(preview, "toProfilePreview").mockResolvedValue({
		userId: "user-1",
		username: "vienna",
		avatar: { kind: "none" },
		publicTopicCount: 1,
		followerCount: 0,
	} as never)
	stubConnectionPool((sentQuery) => toTopicDashboardRows(sentQuery))
	const response = await dashboardsRoute.request("/dashboards/topicDashboard/user-1/head")

	// the public paragraph and share image, and nothing of the full snapshot
	const pageHead = await response.json()
	expect(pageHead).toMatchObject({
		title: expect.stringContaining("vienna's Topic Specials"),
		description: "Public paragraph.",
		imageUrl: expect.stringContaining(`/api/dashboards/topicDashboard/user-1/share-image/${PUBLIC_HASH}.png`),
		cardUrl: expect.stringContaining("/profiles/user-1/specials/topics"),
		isIndexed: true,
	})
	expect(JSON.stringify(pageHead)).not.toContain("Full paragraph.")

	// a team's head is the strip's counts, never its paragraph
	spyOn(preview, "toTeamPreview").mockResolvedValue({
		teamId: "team-1",
		name: "Roasters",
		avatar: { kind: "none" },
		memberCount: 3,
		topicCount: 1,
	} as never)
	stubConnectionPool(({ text }) =>
		text.includes('from "dashboard_snapshots"')
			? [
					toSnapshotRow(
						"summary",
						"public",
						{
							dashboardKind: "teamDashboard",
							topicCount: 1,
							findingCount: 2,
							topicPostCount: 0,
							memberCount: 3,
							viewerCount: 21,
						},
						["hash", "Team paragraph."],
					),
				]
			: [],
	)
	const teamHead = await (await dashboardsRoute.request("/dashboards/teamDashboard/team-1/head")).json()
	expect(teamHead.description).toBe("1 topic, 2 findings, 0 posts, 3 members, 21 visitors.")
})
