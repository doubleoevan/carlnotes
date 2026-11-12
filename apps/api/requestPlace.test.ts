// request place tests: a place is read only through a trusted Cloudflare hop
import { expect, test } from "bun:test"
import { readRequestPlace } from "./requestPlace"

// Cloudflare's edge range, and a private platform hop, both trusted
const ipAddress = { trustedProxies: ["172.64.0.0/13", "10.0.0.0/8"], ipAddressHeaders: ["x-forwarded-for"] }

// Cloudflare's visitor location headers for a visitor in Zürich, with the city's bytes as a header delivers them
const locationHeaders = {
	"cf-ray": "8a1b2c3d4e5f-ZRH",
	"cf-ipcountry": "CH",
	"cf-region": "Zurich",
	"cf-ipcity": "ZÃ¼rich",
	"cf-iplatitude": "47.36667",
	"cf-iplongitude": "8.55",
}

// a request with the given headers
function toRequest(headers: Record<string, string>): Request {
	return new Request("https://carlnotes.com/api/topics/topic-1/view", { method: "POST", headers })
}

test("a request through Cloudflare reads its place, with the city decoded and the coordinates exact", () => {
	const request = toRequest({ ...locationHeaders, "x-forwarded-for": "203.0.113.7, 172.70.1.1, 10.0.0.5" })
	expect(readRequestPlace(request, ipAddress)).toEqual({
		country: "CH",
		region: "Zurich",
		city: "Zürich",
		latitude: "47.36667",
		longitude: "8.55",
	})
})

// the ingress appends the sender's own address, so forged headers sent straight to the origin end in the sender
test("a direct request with forged location headers has no place", () => {
	const directRequest = toRequest({ ...locationHeaders, "x-forwarded-for": "172.70.1.1, 198.51.100.4" })
	const platformOnlyRequest = toRequest({ ...locationHeaders, "x-forwarded-for": "198.51.100.4, 10.0.0.5" })
	expect(readRequestPlace(directRequest, ipAddress)).toBeNull()
	expect(readRequestPlace(platformOnlyRequest, ipAddress)).toBeNull()
})

test("a request with no location headers, no cf-ray, or no trusted proxies has no place", () => {
	const forwardedFor = { "x-forwarded-for": "203.0.113.7, 172.70.1.1" }
	expect(readRequestPlace(toRequest({ ...forwardedFor, "cf-ray": "8a1b2c3d4e5f-ZRH" }), ipAddress)).toBeNull()
	expect(readRequestPlace(toRequest({ ...locationHeaders, ...forwardedFor, "cf-ray": "" }), ipAddress)).toBeNull()
	const untrustedIpAddress = { ...ipAddress, trustedProxies: [] }
	expect(readRequestPlace(toRequest({ ...locationHeaders, ...forwardedFor }), untrustedIpAddress)).toBeNull()
})

test("an unknown country has no place, and a malformed coordinate is dropped", () => {
	const forwardedFor = { "x-forwarded-for": "203.0.113.7, 172.70.1.1" }
	const unknownCountryRequest = toRequest({ ...locationHeaders, ...forwardedFor, "cf-ipcountry": "XX" })
	const malformedCoordinateRequest = toRequest({ ...locationHeaders, ...forwardedFor, "cf-iplatitude": "north" })
	expect(readRequestPlace(unknownCountryRequest, ipAddress)).toBeNull()
	expect(readRequestPlace(malformedCoordinateRequest, ipAddress)?.latitude).toBeNull()
})
