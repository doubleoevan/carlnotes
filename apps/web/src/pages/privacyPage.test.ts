// the privacy page's copy: what a profile page and a Topic Post make public, how visitors are counted and charted by
// place, and the policy that was there before
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// the privacy page's source, whose markdown body is the policy
const privacyPageSource = readFileSync(join(import.meta.dir, "PrivacyPage.tsx"), "utf8")

test("the policy says a Café is public and what only its person sees", () => {
	expect(privacyPageSource).toContain("Your Café is a public page.")
	expect(privacyPageSource).toContain("Only you see your private and invite-only topics there")
})

test("the policy says an Open Mic post is as visible as its topic", () => {
	expect(privacyPageSource).toContain("An Open Mic post is as visible as its topic.")
	expect(privacyPageSource).toContain("A draft is visible only to you.")
})

test("the policy says Café and team visits are counted like topic views, with nothing set on the device", () => {
	expect(privacyPageSource).toContain("A Café and a team page count their visitors the same way.")
	expect(privacyPageSource).toContain("sets nothing on your device")
})

test("the policy says visitors are charted by place with no IP address stored and a ten-person city minimum", () => {
	expect(privacyPageSource).toContain("Specials pages chart visits and plays by day and by place.")
	expect(privacyPageSource).toContain("never your IP address")
	expect(privacyPageSource).toContain("A city shows on a map only after ten different people have visited from it.")
})

test("the additions leave the existing policy whole", () => {
	expect(privacyPageSource).toContain("**Viewer and listener counts.** To show how many people view a topic")
	expect(privacyPageSource).toContain("Topics are private by default.")
	expect(privacyPageSource).toContain("We do not sell your personal information")
})
