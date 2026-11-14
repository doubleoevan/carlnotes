// a request's place from Cloudflare's visitor location headers, read only if a Cloudflare hop reported the client
import { BlockList, isIP } from "node:net"
import type { Place } from "@carlnotes/contracts/dashboards"
import { ipAddressOptions, isExternalAddress, toForwardedForHops } from "./trustedProxies"

// the longest region or city name kept. a real one is far shorter
const PLACE_NAME_MAX_LENGTH = 100

// a postal code as Cloudflare sends it, like 94107 or SW1A 1AA, and a metro code, the Nielsen DMA number like 807
const POSTAL_CODE_PATTERN = /^[0-9A-Za-z][0-9A-Za-z -]{0,15}$/
const METRO_CODE_PATTERN = /^\d{1,6}$/

// a decimal coordinate as Cloudflare sends it, like 37.78044
const COORDINATE_PATTERN = /^-?\d{1,3}(\.\d{1,10})?$/

// a two-letter country code, and the codes Cloudflare sends for an unknown country and for Tor
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/
const UNKNOWN_COUNTRY_CODES = new Set(["XX", "T1"])

/**
 * Returns the place Cloudflare reported for a request, or null if the request did not come through a trusted Cloudflare
 * hop or Cloudflare knew no country.
 */
export function readRequestPlace(request: Request, ipAddress = ipAddressOptions): Place | null {
	if (!request.headers.get("cf-ray") || !isClientReportedByTrustedHop(request, ipAddress.trustedProxies)) {
		return null
	}

	// a country Cloudflare knows, else no place
	const country = request.headers.get("cf-ipcountry")?.trim().toUpperCase() ?? ""
	if (!COUNTRY_CODE_PATTERN.test(country) || UNKNOWN_COUNTRY_CODES.has(country)) {
		return null
	}
	return {
		country,
		region: toPlaceName(request.headers.get("cf-region")),
		city: toPlaceName(request.headers.get("cf-ipcity")),
		postalCode: toPlaceCode(request.headers.get("cf-postal-code"), POSTAL_CODE_PATTERN),
		metroCode: toPlaceCode(request.headers.get("cf-metro-code"), METRO_CODE_PATTERN),
		latitude: toCoordinate(request.headers.get("cf-iplatitude")),
		longitude: toCoordinate(request.headers.get("cf-iplongitude")),
	}
}

// whether the x-forwarded-for entry right of the client is a trusted public hop, which is Cloudflare's edge. a request
// sent straight to the origin ends in the sender's own address, and a private platform hop never counts as Cloudflare
function isClientReportedByTrustedHop(request: Request, trustedProxies: string[]): boolean {
	const trustedProxyList = toTrustedProxyList(trustedProxies)
	if (!trustedProxyList) {
		return false
	}

	// the client is the rightmost entry outside every trusted range, as Better Auth resolves it
	const hops = toForwardedForHops(request.headers.get("x-forwarded-for"))
	const clientIndex = hops.findLastIndex((hop) => !isTrustedHop(trustedProxyList, hop))
	const reportingHop = clientIndex >= 0 ? hops[clientIndex + 1] : undefined
	return reportingHop !== undefined && isExternalAddress(reportingHop)
}

// the trusted ranges as a list to match addresses against, or null if none is set
function toTrustedProxyList(trustedProxies: string[]): BlockList | null {
	const trustedProxyList = new BlockList()
	for (const trustedProxy of trustedProxies) {
		// an entry is an address or an address with a prefix length, and an entry that is neither is skipped
		const [address = "", prefixLength] = trustedProxy.split("/")
		const family = toAddressFamily(address)
		if (!family) {
			continue
		}
		// add a range with its prefix length, or a single address
		if (prefixLength) {
			trustedProxyList.addSubnet(address, Number(prefixLength), family)
		} else {
			trustedProxyList.addAddress(address, family)
		}
	}
	return trustedProxyList.rules.length > 0 ? trustedProxyList : null
}

// whether a hop is an address inside a trusted range. a hop that is no address is never trusted
function isTrustedHop(trustedProxyList: BlockList, hop: string): boolean {
	const family = toAddressFamily(hop)
	return family !== null && trustedProxyList.check(hop, family)
}

// the family of an address, or null for a string that is no address
function toAddressFamily(address: string): "ipv4" | "ipv6" | null {
	const version = isIP(address)
	return version === 4 ? "ipv4" : version === 6 ? "ipv6" : null
}

// a region or city name re-read as UTF-8, or null if empty or too long
function toPlaceName(headerValue: string | null): string | null {
	const placeName = toUtf8(headerValue?.trim() ?? "")
	return placeName && placeName.length <= PLACE_NAME_MAX_LENGTH ? placeName : null
}

// a header value whose characters are each one byte, decoded as the UTF-8 those bytes spell. a value that is already
// decoded, or whose bytes are not UTF-8, is kept as it is
function toUtf8(headerValue: string): string {
	if ([...headerValue].some((character) => character.charCodeAt(0) > 0xff)) {
		return headerValue
	}

	// decode the bytes, keeping the value as it is if they are not UTF-8
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(headerValue, "latin1"))
	} catch {
		return headerValue
	}
}

// a postal or metro code exactly as Cloudflare sent it, or null if it does not match the code's pattern
function toPlaceCode(headerValue: string | null, codePattern: RegExp): string | null {
	const placeCode = headerValue?.trim() ?? ""
	return codePattern.test(placeCode) ? placeCode : null
}

// a coordinate exactly as Cloudflare sent it, or null if it is not a decimal number
function toCoordinate(headerValue: string | null): string | null {
	const coordinate = headerValue?.trim() ?? ""
	return COORDINATE_PATTERN.test(coordinate) ? coordinate : null
}
