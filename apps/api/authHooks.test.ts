// auth hook tests: which login method a request reports, where a request came from, the authorization proxy's hosts,
// and the redirects that may open the app
import { expect, test } from "bun:test"
import {
	rejectSchemeRedirectOutsideSocialSignIn,
	rejectUnknownAuthorizationProxy,
	toEntryPoint,
	toLoginMethod,
} from "./authHooks"

// the password form, an oauth callback, and the app's posted ID token each name their method
test("a request's login method is its form, its callback provider, or its ID token's provider", () => {
	expect(toLoginMethod("/sign-in/email", { email: "a@example.com" })).toBe("email")
	expect(toLoginMethod("/callback/google", undefined)).toBe("google")
	expect(toLoginMethod("/sign-in/social", { provider: "apple", idToken: { token: "t" } })).toBe("apple")
})

// a browser's social sign-in starts at /sign-in/social with no ID token, and reports from its callback instead
test("a social sign-in that opens the browser reports nothing until its callback", () => {
	expect(toLoginMethod("/sign-in/social", { provider: "google", callbackURL: "/" })).toBeNull()
	expect(toLoginMethod("/get-session", undefined)).toBeNull()
})

// the Expo origin header marks a request from the mobile app, and so does an ID token, which comes with no header
test("a request with the Expo origin header or an ID token comes from the mobile app", () => {
	expect(toEntryPoint(new Headers({ "expo-origin": "carlnotes://" }), undefined)).toBe("mobile")
	expect(toEntryPoint(new Headers(), { provider: "apple", idToken: { token: "t" } })).toBe("mobile")
	expect(toEntryPoint(new Headers({ origin: "https://carlnotes.com" }), { email: "a@example.com" })).toBe("web")
	expect(toEntryPoint(undefined, undefined)).toBe("web")
})

// the proxy sends a browser to a provider's sign-in page alone, and never a browser that already holds a session
test("the authorization proxy is held to the providers' sign-in pages", () => {
	const googleUrl = "https://accounts.google.com/o/oauth2/v2/auth?state=s"
	const proxyRequest = (authorizationURL: string, cookie?: string): (() => void) => {
		return () =>
			rejectUnknownAuthorizationProxy({
				path: "/expo-authorization-proxy",
				query: { authorizationURL },
				headers: new Headers(cookie ? { cookie } : {}),
			})
	}
	expect(proxyRequest(googleUrl)).not.toThrow()
	expect(proxyRequest("https://evil.example/?state=s")).toThrow("not a provider's sign-in page")
	expect(proxyRequest("not a url")).toThrow("not a provider's sign-in page")
	expect(proxyRequest(googleUrl, "better-auth.session_token=abc")).toThrow("signed-in browser")

	// every other path is left alone
	expect(() =>
		rejectUnknownAuthorizationProxy({ path: "/sign-in/email", query: { authorizationURL: "x" }, headers: undefined }),
	).not.toThrow()
})

// the app's scheme is a redirect for the social sign-in alone. a reset link must never open whichever app claims it
test("a redirect to the app's scheme is rejected outside the social sign-in", () => {
	expect(() =>
		rejectSchemeRedirectOutsideSocialSignIn("/sign-in/social", { callbackURL: "carlnotes:///" }),
	).not.toThrow()
	expect(() =>
		rejectSchemeRedirectOutsideSocialSignIn("/request-password-reset", {
			email: "a@example.com",
			redirectTo: "carlnotes:///",
		}),
	).toThrow("redirectTo may not open the app")
	expect(() =>
		rejectSchemeRedirectOutsideSocialSignIn("/send-verification-email", { callbackURL: "CARLNOTES://x" }),
	).toThrow("callbackURL may not open the app")
	expect(() =>
		rejectSchemeRedirectOutsideSocialSignIn("/request-password-reset", { redirectTo: "/reset-password" }),
	).not.toThrow()

	// a verification link's callback comes in the query, which the hook checks the same way
	expect(() => rejectSchemeRedirectOutsideSocialSignIn("/verify-email", { callbackURL: "carlnotes:///" })).toThrow(
		"callbackURL may not open the app",
	)
})
