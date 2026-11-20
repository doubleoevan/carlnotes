// the functions that read a number or a named value an environment setting holds, shared by the api, the worker, and
// the database module

/**
 * Returns an environment value as a whole number above zero,
 * or the default if the value is unset or is not a whole number above zero.
 */
export function toPositiveInteger(value: string | undefined, defaultValue: number): number {
	return toIntegerAtLeast(value, defaultValue, 1)
}

/**
 * Returns an environment value as a whole number of zero or more,
 * or the default if the value is unset, empty, or not a whole number of zero or more.
 */
export function toWholeNumber(value: string | undefined, defaultValue: number): number {
	return toIntegerAtLeast(value, defaultValue, 0)
}

/**
 * Returns an environment value in dollars as whole cents above zero,
 * or the default's cents if the value is unset, empty, or not a number of dollars above zero.
 */
export function toPositiveCents(value: string | undefined, defaultDollars: number): number {
	// read the dollars, falling back to the default, then round to at least one cent
	const parsedDollars = value?.trim() ? Number(value) : Number.NaN
	const dollars = Number.isFinite(parsedDollars) && parsedDollars > 0 ? parsedDollars : defaultDollars
	return Math.max(1, Math.round(dollars * 100))
}

// an environment value as a whole number at or above the minimum, or the default for an unset, empty, or other value
function toIntegerAtLeast(value: string | undefined, defaultValue: number, minimum: number): number {
	const parsedNumber = value?.trim() ? Number(value) : Number.NaN
	return Number.isInteger(parsedNumber) && parsedNumber >= minimum ? parsedNumber : defaultValue
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

// a setting's name, its value, the values it may be set to, and the value it reads as if it is unset or empty
type EnumSettingOptions<AllowedValue extends string, DefaultValue extends string> = {
	settingName: string
	value: string | undefined
	allowedValues: readonly AllowedValue[]
	defaultValue: DefaultValue
}

/**
 * Returns a setting's value if it is one of the allowed values, or the default if it is unset or empty. Any other value
 * throws an error that names the allowed values, so a typo never reads as another value.
 */
export function readEnumSetting<AllowedValue extends string, DefaultValue extends string>({
	settingName,
	value,
	allowedValues,
	defaultValue,
}: EnumSettingOptions<AllowedValue, DefaultValue>): AllowedValue | DefaultValue {
	if (!value) {
		return defaultValue
	}

	// an allowed value, or a value that is none of them
	if ((allowedValues as readonly string[]).includes(value)) {
		return value as AllowedValue
	}
	throw new Error(`${settingName} must be ${allowedValues.join(", ")}, or unset`)
}
