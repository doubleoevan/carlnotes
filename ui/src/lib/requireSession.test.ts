// requireSession tests: where the guard sends a signed-out visitor, and that a signed-in user goes through
import { afterEach, expect, test } from "bun:test"
import { type AnyRedirect, isRedirect } from "@tanstack/react-router"
import { authClient } from "@/clients/authClient"
import { requireSession } from "./requireSession"

// the Better Auth session atom useSession reads, and the state it starts with, set back after each test
const sessionAtom = authClient.$store.atoms.session as NonNullable<typeof authClient.$store.atoms.session>
const initialSessionState = sessionAtom.get()

// settle the session atom the way useSession does once the api returns, with no session or with one
function setSettledSession(sessionData: unknown): void {
	sessionAtom.set({ ...initialSessionState, data: sessionData, isPending: false })
}

// run the guard at a path, and return the href of the redirect it throws
async function readRedirectHref(href: string): Promise<string | undefined> {
	const thrownError = await requireSession({ location: { href } }).catch((error: unknown) => error)
	expect(isRedirect(thrownError)).toBe(true)
	return (thrownError as AnyRedirect).options.href
}

// each test sets its own session, so that none of them leak into the next
afterEach(() => {
	sessionAtom.set(initialSessionState)
})

// the whole path and query go into next, encoded so the & in the query stays part of next
test("a signed-out visitor at the consent page is sent to log in with the consent path", async () => {
	setSettledSession(null)
	expect(await readRedirectHref("/mcp/consent?consent_code=a&client_id=b")).toBe(
		`/login?next=${encodeURIComponent("/mcp/consent?consent_code=a&client_id=b")}`,
	)
})

// a page's query string returns with the visitor after sign-in
test("a signed-out visitor at the activity page is sent to log in with its query", async () => {
	setSettledSession(null)
	expect(await readRedirectHref("/activity?userId=u1")).toBe("/login?next=%2Factivity%3FuserId%3Du1")
})

// a settled session lets the route load with no redirect
test("a signed-in user resolves with no redirect", async () => {
	setSettledSession({ user: { id: "u1" }, session: { id: "s1" } })
	expect(await requireSession({ location: { href: "/activity?userId=u1" } })).toBeUndefined()
})
