// the line under a profile's name: its counts in order with a zero left out, and the Blocked link only for a profile
// the user blocked
import { expect, test } from "bun:test"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { ProfileSummaryLine } from "./ProfileSummaryLine"

// a profile the user did not block, and the counts of a page with no topics, podcast episodes, or teams
const PROFILE = { joinedAt: "2026-07-15T12:00:00.000Z", subscriberCount: 20, isBlocked: false }
const NO_COUNTS = { topicCount: 0, podcastEpisodeCount: 0, teamCount: 0 }

test("a blocked profile links to the account page's list after its followers", async () => {
	const html = await renderWithRouter(<ProfileSummaryLine profile={{ ...PROFILE, isBlocked: true }} {...NO_COUNTS} />)
	expect(html).toContain("20 followers ·")
	expect(html).toContain('href="/account#blocked-people"')
	expect(html.indexOf("20 followers")).toBeLessThan(html.indexOf("Blocked"))
})

test("a profile the user did not block has no Blocked link, and its last detail has no dot", async () => {
	const html = await renderWithRouter(<ProfileSummaryLine profile={PROFILE} {...NO_COUNTS} />)
	expect(html).toContain("20 followers<")
	expect(html).not.toContain("Blocked")
})

test("the topics, podcast episodes, and teams follow the followers in order, each left out at zero", async () => {
	const html = await renderWithRouter(
		<ProfileSummaryLine profile={PROFILE} topicCount={5} podcastEpisodeCount={1} teamCount={2} />,
	)
	const detailIndexes = ["20 followers ·", "5 topics ·", "1 podcast episode ·", "2 teams<"].map((detail) =>
		html.indexOf(detail),
	)
	expect(detailIndexes).toEqual([...detailIndexes].sort((first, second) => first - second))
	expect(detailIndexes).not.toContain(-1)

	// a count of zero, and a topic count that has not loaded, are left out
	const sparseHtml = await renderWithRouter(
		<ProfileSummaryLine profile={PROFILE} topicCount={null} podcastEpisodeCount={0} teamCount={1} />,
	)
	expect(sparseHtml).toContain("20 followers ·")
	expect(sparseHtml).toContain("1 team<")
	expect(sparseHtml).not.toMatch(/topic|podcast episode/)
})
