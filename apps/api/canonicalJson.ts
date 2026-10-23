// json with every object's keys sorted, which a keyed digest signs so the same value always signs the same

/**
 * Returns json with every object's keys sorted, so two equal values always write the same text.
 */
export function toCanonicalJson(value: unknown): string {
	return JSON.stringify(value, (_key, nestedValue: unknown) =>
		nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)
			? Object.fromEntries(
					Object.entries(nestedValue).sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey)),
				)
			: nestedValue,
	)
}
