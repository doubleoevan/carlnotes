// normalization reads only synthetic provider text and performs no network requests
import { expect, test } from "bun:test"
import { normalizePersonalSourcesEmail } from "./personalSourcesEmailContent"
import { personalSourcesEmailFixture } from "./personalSourcesEmailTestFixtures"

test("mail HTML drops remote assets, executable text, unsafe links, tracking, and unsubscribe URLs", () => {
	const email = personalSourcesEmailFixture({
		text: null,
		html: '<style>hidden-style</style><script>hidden-script</script><img src="https://pixel.example.org/x"><p>Visible &amp; useful</p><a href="https://example.org/article?utm_source=mail">Article</a><a href="mailto:owner@example.org">Mail</a><a href="http://127.0.0.1/a">Private</a><a href="https://click.example.org/track">Tracking</a><a href="https://example.org/unsubscribe">Unsubscribe</a><form><a href="https://example.org/form">Form</a></form>',
	})
	const { payload } = normalizePersonalSourcesEmail({
		email,
		ownerEmail: "owner@example.com",
		isOwnerEmailVerified: true,
	})
	expect(payload.links).toEqual(["https://example.org/article"])
	expect(payload.text).toContain("Visible & useful")
	expect(payload.text).not.toContain("hidden-")
	expect(payload.text).not.toContain("Form")
	expect(payload.chatUrl).toBeNull()
})

test("personal-forward preference requires receiver authentication and the verified owner's exact mailbox", () => {
	const normalize = (
		email = personalSourcesEmailFixture(),
		isOwnerEmailVerified = true,
	): ReturnType<typeof normalizePersonalSourcesEmail>["payload"]["senderKind"] =>
		normalizePersonalSourcesEmail({ email, ownerEmail: "owner@example.com", isOwnerEmailVerified }).payload.senderKind
	expect(normalize()).toBe("personal_forward")
	expect(normalize(personalSourcesEmailFixture(), false)).toBe("unknown")
	expect(
		normalize(
			personalSourcesEmailFixture({
				authentication: null,
				headers: { "Authentication-Results": "dkim=pass; dmarc=pass" },
			}),
		),
	).toBe("unknown")
	expect(
		normalize(
			personalSourcesEmailFixture({
				from: '"owner@example.com" <stranger@example.org>',
				text: "---------- Forwarded message ---------- From: owner@example.com",
			}),
		),
	).toBe("unknown")
	expect(normalize(personalSourcesEmailFixture({ headers: { "List-Id": "newsletter.example.org" } }))).toBe(
		"newsletter",
	)
})

test("long mail text and candidate links remain bounded with visible omitted-link counts", () => {
	const text = `${Array.from({ length: 103 }, (_, i) => `https://example.org/${i}`).join("\n")}\n${"x".repeat(90_000)}`
	const normalized = normalizePersonalSourcesEmail({
		email: personalSourcesEmailFixture({ text, subject: "😀".repeat(220) }),
		ownerEmail: "owner@example.com",
		isOwnerEmailVerified: true,
	})
	expect(normalized.payload.text.length).toBe(80_000)
	expect([...normalized.payload.title]).toHaveLength(200)
	expect(normalized.payload.links).toHaveLength(100)
	expect(normalized.omittedLinkCount).toBe(3)
})

// manual forwarding commonly removes list headers but preserves the newsletter's unsubscribe controls
test("forwarded newsletter controls retain reduced provenance without list headers", () => {
	for (const content of [
		{
			text: "Forwarded newsletter: https://example.org/article Unsubscribe: https://example.org/unsubscribe/reader",
			html: null,
		},
		{
			text: null,
			html: '<p>Forwarded newsletter</p><a href="https://example.org/article">Article</a><a href="https://example.org/settings">Manage email preferences</a>',
		},
	]) {
		const normalized = normalizePersonalSourcesEmail({
			email: personalSourcesEmailFixture(content),
			ownerEmail: "owner@example.com",
			isOwnerEmailVerified: true,
		})
		expect(normalized.payload.senderKind).toBe("newsletter")
		expect(normalized.payload.links).toEqual(["https://example.org/article"])
	}

	// merely discussing newsletters does not make a personal note automatic mail
	const personal = normalizePersonalSourcesEmail({
		email: personalSourcesEmailFixture({
			text: "I am comparing newsletters and unsubscribe UX. https://example.org/article",
		}),
		ownerEmail: "owner@example.com",
		isOwnerEmailVerified: true,
	})
	expect(personal.payload.senderKind).toBe("personal_forward")
})
