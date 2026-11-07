// the line under a profile's name: the Blocked link shows only for a profile the user blocked
import { expect, test } from "bun:test"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { ProfileSummaryLine } from "./ProfileSummaryLine"

const PROFILE = { joinedAt: "2026-07-15T12:00:00.000Z", subscriberCount: 20, isBlocked: false }

test("a blocked profile links to the account page's list after its followers", async () => {
	const html = await renderWithRouter(<ProfileSummaryLine profile={{ ...PROFILE, isBlocked: true }} />)
	expect(html).toContain("20 followers")
	expect(html).toContain('href="/account#blocked-people"')
	expect(html.indexOf("20 followers")).toBeLessThan(html.indexOf("Blocked"))
})

test("a profile the user did not block has no Blocked link", async () => {
	const html = await renderWithRouter(<ProfileSummaryLine profile={PROFILE} />)
	expect(html).toContain("20 followers")
	expect(html).not.toContain("Blocked")
})
