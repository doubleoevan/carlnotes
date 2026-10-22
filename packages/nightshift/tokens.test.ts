// the committed tokens.css and Figma files match what the source writes, and each type role matches its Tailwind classes
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { typeRoles } from "./typography"
import { toWrittenFiles } from "./writtenFiles"

// Tailwind's default theme, which gives each class its values
const TAILWIND_THEME_CSS = readFileSync(Bun.resolveSync("tailwindcss/theme.css", import.meta.dir), "utf8")

// each committed file equals what the token writer would write now
for (const [packagePath, writtenText] of Object.entries(toWrittenFiles())) {
	test(`${packagePath} matches the source`, () => {
		const committedText = readFileSync(join(import.meta.dir, packagePath), "utf8")
		expect(
			committedText === writtenText,
			`packages/nightshift/${packagePath} differs from the source. run bun run nightshift:write`,
		).toBe(true)
	})
}

// each role's size, line height, weight, and letter spacing equal what its classes give
for (const [roleName, typeRole] of Object.entries(typeRoles)) {
	test(`the ${roleName} role matches its Tailwind classes`, () => {
		expect(toClassValues(typeRole.className)).toEqual({
			fontSizeRem: typeRole.fontSizeRem,
			lineHeightRem: typeRole.lineHeightRem,
			fontWeight: typeRole.fontWeight,
			letterSpacingEm: "letterSpacingEm" in typeRole ? typeRole.letterSpacingEm : undefined,
		})
	})
}

// the values a class list gives: the text size and its own line height, a leading class's ratio over it, a weight,
// and a tracking
function toClassValues(className: string): {
	fontSizeRem: number
	lineHeightRem: number
	fontWeight: number
	letterSpacingEm: number | undefined
} {
	// the class names by their prefix
	const classNames = className.split(" ")
	const sizeName = classNames.find((name) => /^text-(xs|sm|base|lg|xl|\dxl)$/.test(name))?.slice("text-".length)
	const leadingName = classNames.find((name) => name.startsWith("leading-"))?.slice("leading-".length)
	const weightName = classNames.find((name) => /^font-(normal|medium|semibold|bold)$/.test(name))?.slice("font-".length)
	const trackingName = classNames.find((name) => name.startsWith("tracking-"))?.slice("tracking-".length)
	if (!sizeName) {
		throw new Error(`${className} names no text size`)
	}

	// the size, and the line height its leading class or its own ratio gives
	const fontSizeRem = Number.parseFloat(readThemeValue(`--text-${sizeName}`))
	const lineHeightRatio = leadingName
		? Number(readThemeValue(`--leading-${leadingName}`))
		: evaluateDivision(readThemeValue(`--text-${sizeName}--line-height`))
	return {
		fontSizeRem,
		lineHeightRem: Number((fontSizeRem * lineHeightRatio).toFixed(4)),
		fontWeight: Number(readThemeValue(`--font-weight-${weightName ?? "normal"}`)),
		letterSpacingEm: trackingName ? Number.parseFloat(readThemeValue(`--tracking-${trackingName}`)) : undefined,
	}
}

// one custom property's value in Tailwind's theme, or throw an error if the theme has no such property
function readThemeValue(propertyName: string): string {
	const match = new RegExp(`${propertyName}:\\s*([^;]+);`).exec(TAILWIND_THEME_CSS)
	if (!match?.[1]) {
		throw new Error(`Tailwind's theme has no ${propertyName}`)
	}
	return match[1].trim()
}

// a calc(a / b) value as a number
function evaluateDivision(calcValue: string): number {
	const [numerator = "", denominator = ""] = calcValue.replace(/^calc\(|\)$/g, "").split("/")
	return Number(numerator) / Number(denominator)
}
