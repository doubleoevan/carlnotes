import { createIsomorphicFn } from "@tanstack/react-start"

/**
 * Whether the page request brought a session cookie. Only the server, inside a request, can read the cookie header.
 * In the browser, and in a test, hasSessionCookie returns false.
 */
export const hasSessionCookie = createIsomorphicFn()
	.server(async () => {
		// import the server-only readers inside the server function, so the browser bundle leaves them out
		const { getRequestHeader } = await import("@tanstack/react-start/server")
		const { getSessionCookie } = await import("better-auth/cookies")

		// find Better Auth's session cookie in the request's cookie header.
		// a read outside a request throws an error, and counts as no cookie
		try {
			return Boolean(getSessionCookie(new Headers({ cookie: getRequestHeader("cookie") ?? "" })))
		} catch {
			return false
		}
	})
	.client(() => false)
