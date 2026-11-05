// address classification shared by intake validation and public fetching
// the ipv4 ranges a fetched host may never resolve to, as [firstOctet, minSecond, maxSecond]:
// loopback, this-network, private, link-local, cgnat
const INTERNAL_V4_RANGES: [number, number, number][] = [
	[0, 0, 255],
	[10, 0, 255],
	[127, 0, 255],
	[169, 254, 254],
	[172, 16, 31],
	[192, 168, 168],
	[100, 64, 127],
]

/**
 * Identifies addresses that cannot serve a public page.
 */
export function isInternalAddress(address: string): boolean {
	// an ipv6-mapped ipv4 address is checked as the ipv4 it wraps, in any spelling
	const ipv4 = toMappedIpv4(address) ?? address
	if (/^\d+\.\d+\.\d+\.\d+$/.test(ipv4)) {
		// 224 and up is multicast, reserved, and broadcast space, which is never a page to fetch
		const [first = 0, second = 0] = ipv4.split(".").map(Number)
		if (first >= 224) {
			return true
		}
		return INTERNAL_V4_RANGES.some(([octet, min, max]) => first === octet && second >= min && second <= max)
	}

	// ipv6 loopback, unspecified, unique-local (fc00::/7), link-local (fe80::/10), and multicast (ff00::/8)
	const ipv6 = (toCanonicalIpv6(address) ?? address).toLowerCase()
	return ipv6 === "::1" || ipv6 === "::" || /^f[cd]/.test(ipv6) || /^fe[89ab]/.test(ipv6) || /^ff/.test(ipv6)
}

// the ipv4 an ipv6-mapped address wraps, in any spelling, or null for any other address
function toMappedIpv4(address: string): string | null {
	// the url parser writes a mapped ipv4 one way: ::ffff: and two hex groups of two octets each
	const hexGroups = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(toCanonicalIpv6(address) ?? "")
	if (!hexGroups?.[1] || !hexGroups[2]) {
		return null
	}
	const [high, low] = [Number.parseInt(hexGroups[1], 16), Number.parseInt(hexGroups[2], 16)]
	return [high >> 8, high & 255, low >> 8, low & 255].join(".")
}

// an ipv6 address as the url parser writes it, or null for anything that is not one
function toCanonicalIpv6(address: string): string | null {
	try {
		return new URL(`http://[${address}]/`).hostname.slice(1, -1)
	} catch {
		return null
	}
}
