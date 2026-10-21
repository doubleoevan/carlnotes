// the functions that read a number an environment setting holds, shared by the api, the worker, and the database module

/**
 * Returns an environment value as a whole number above zero,
 * or the default if the value is unset or is not a whole number above zero.
 */
export function toPositiveInteger(value: string | undefined, defaultValue: number): number {
	const parsedNumber = Number(value)
	return Number.isInteger(parsedNumber) && parsedNumber > 0 ? parsedNumber : defaultValue
}

/**
 * Reads a setting in dollars, or the default if unset or empty, and throws an error on anything but zero or more dollars.
 */
export function readDollarSetting(settingName: string, defaultDollars: number): number {
	// an empty value reads as unset, the way toPositiveInteger reads one
	const configuredValue = Bun.env[settingName]?.trim()
	const dollars = configuredValue ? Number(configuredValue) : defaultDollars
	if (!Number.isFinite(dollars) || dollars < 0) {
		throw new Error(`${settingName} must be a number of dollars, zero or more. got: ${configuredValue}`)
	}
	return dollars
}
