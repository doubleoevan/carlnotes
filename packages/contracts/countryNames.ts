// a country's English name from its two-letter code

// the English region names, made on the first call
let regionNames: Intl.DisplayNames | null = null

/**
 * Returns a country code's English name, or null for a code with no name, for a malformed code, and on a runtime with
 * no Intl.DisplayNames.
 */
export function toCountryName(country: string): string | null {
	try {
		// the region names, then the code's name, which is the code itself for a code with no name
		regionNames ??= new Intl.DisplayNames(["en"], { type: "region" })
		const countryName = regionNames.of(country)
		return countryName && countryName !== country ? countryName : null
	} catch {
		return null
	}
}
