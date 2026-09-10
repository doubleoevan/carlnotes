// rate limit key tests for who a request is limited as
import { expect, test } from "bun:test"
import { toClientAddress, toRateLimitKey } from "./rateLimit"

// a user is one caller, whatever chain the request also sends
test("a user is keyed by their id ahead of any address", () => {
	expect(toRateLimitKey({ userId: "user-1", forwardedFor: "1.2.3.4" }, 1)).toBe("user:user-1")
})

// behind trusted proxies the client is the last proxy's peer, whatever a client wrote ahead of it
test("a visitor is keyed by the hop the trusted proxies vouch for", () => {
	expect(toClientAddress("1.2.3.4", 1)).toBe("1.2.3.4")
	expect(toClientAddress("9.9.9.9, 1.2.3.4", 1)).toBe("1.2.3.4")
	expect(toClientAddress("9.9.9.9, 1.2.3.4, 10.0.0.1", 2)).toBe("1.2.3.4")
	expect(toRateLimitKey({ userId: null, forwardedFor: "9.9.9.9, 1.2.3.4" }, 1)).toBe("address:1.2.3.4")
})

// visitors share one bucket when no proxy is trusted, no chain arrived, or the chain is shorter than the proxies
test("visitors share one bucket without a vouched-for address", () => {
	expect(toRateLimitKey({ userId: null, forwardedFor: "1.2.3.4" }, 0)).toBe("shared")
	expect(toRateLimitKey({ userId: null, forwardedFor: null }, 1)).toBe("shared")
	expect(toRateLimitKey({ userId: null, forwardedFor: "1.2.3.4" }, 2)).toBe("shared")
})
