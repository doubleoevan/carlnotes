// the Typography page's specimens: the web app's two font families, every type role set in its own values, and the
// email font stack at the size of each role the emails use, each read from the Nightshift TypeScript source
import { EMAIL_FONT_STACK, toEmailFontSize } from "@carlnotes/nightshift/email"
import {
	type FontFamily,
	type FontFamilyName,
	fontFamilies,
	type TypeRole,
	type TypeRoleName,
	typeRoles,
} from "@carlnotes/nightshift/typography"
import { toRemAndPixels } from "@carlnotes/nightshift/units"
import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"
import { CODE_STYLE, DESCRIPTION_STYLE, NAME_STYLE, SECTION_CARD_STYLE } from "./pageStyles"
import { BODY_CELL_CLASS, HEADER_CELL_CLASS, ScrollingTable } from "./ScrollingTable"

// the sentence every specimen sets
const SAMPLE_SENTENCE = "Carl read 42 Sources overnight and kept three Findings for LLM tooling."

// the web app's font families. the email stack has its own section
const WEB_FONT_FAMILY_NAMES: Exclude<FontFamilyName, "email">[] = ["sans", "display"]

// the type role names, in the source's order
const TYPE_ROLE_NAMES = Object.keys(typeRoles) as TypeRoleName[]

// the type roles the email templates take a font size from, in the source's order
const EMAIL_TYPE_ROLE_NAMES: TypeRoleName[] = ["pageTitle", "sectionHeading", "body", "bodyLarge", "caption"]

// a specimen: its name, its sample, and its values, stacked
const SPECIMEN_STYLE: CSSProperties = { display: "flex", flexDirection: "column", gap: "0.5rem" }

// a font family's sample line
const FAMILY_SAMPLE_STYLE: CSSProperties = { margin: 0, fontSize: "1.5rem", lineHeight: 1.4 }

/**
 * Shows the web app's two font families: each one's name, description, CSS stack, and a sample line set in that
 * stack.
 */
export function FontFamilySpecimens() {
	return (
		<ul className="sb-unstyled" style={SECTION_CARD_STYLE}>
			{WEB_FONT_FAMILY_NAMES.map((fontFamilyName) => (
				<FontFamilySpecimen key={fontFamilyName} fontFamily={fontFamilies[fontFamilyName]} />
			))}
		</ul>
	)
}

/**
 * Shows every type role: a sample set in the role's own values, then its family, size, line height, weight, letter
 * spacing, classes, and description.
 */
export function TypeSpecimens() {
	return (
		<ul className="sb-unstyled" style={SECTION_CARD_STYLE}>
			{TYPE_ROLE_NAMES.map((typeRoleName) => (
				<TypeRoleSpecimen key={typeRoleName} typeRoleName={typeRoleName} />
			))}
		</ul>
	)
}

/**
 * Shows the email font stack, then a sample at the email size of each type role the email templates use.
 */
export function EmailTypeSpecimens() {
	return (
		<ul className="sb-unstyled" style={SECTION_CARD_STYLE}>
			{/* the email stack */}
			<FontFamilySpecimen fontFamily={fontFamilies.email} />

			{/* each role the emails use at its email size, at 1.5, the only line height the email templates write */}
			{EMAIL_TYPE_ROLE_NAMES.map((typeRoleName) => (
				<li key={typeRoleName} style={{ ...SPECIMEN_STYLE, gap: "0.125rem" }}>
					<p style={CODE_STYLE}>
						{typeRoleName}: {toEmailFontSize(typeRoleName)}
					</p>
					<p
						style={{
							margin: 0,
							fontFamily: EMAIL_FONT_STACK,
							fontSize: toEmailFontSize(typeRoleName),
							lineHeight: "1.5",
						}}
					>
						{SAMPLE_SENTENCE}
					</p>
				</li>
			))}
		</ul>
	)
}

// one font family: its name, its description, its stack, and a sample line in that stack
function FontFamilySpecimen({ fontFamily }: { fontFamily: FontFamily }) {
	return (
		<li style={SPECIMEN_STYLE}>
			<p style={NAME_STYLE}>{fontFamily.name}</p>
			<p style={DESCRIPTION_STYLE}>{fontFamily.description}</p>
			<p style={CODE_STYLE}>{fontFamily.stack}</p>
			<p style={{ ...FAMILY_SAMPLE_STYLE, fontFamily: fontFamily.stack }}>{SAMPLE_SENTENCE}</p>
		</li>
	)
}

// one type role: its name, a sample set in its values, and a table of those values
function TypeRoleSpecimen({ typeRoleName }: { typeRoleName: TypeRoleName }) {
	const typeRole: TypeRole = typeRoles[typeRoleName]
	return (
		<li style={SPECIMEN_STYLE}>
			{/* the name and the sample */}
			<p style={NAME_STYLE}>{typeRoleName}</p>
			<p style={toTypeRoleStyle(typeRole)}>{SAMPLE_SENTENCE}</p>

			{/* the values the role's classes give, each row named by its property */}
			<ScrollingTable label={`${typeRoleName} values`} minWidth="28rem">
				<tbody>
					{toTypeRoleRows(typeRole).map(([propertyName, propertyValue]) => (
						<tr key={propertyName} className="border-b">
							<th scope="row" className={cn("text-muted-foreground", HEADER_CELL_CLASS)}>
								{propertyName}
							</th>
							<td className={BODY_CELL_CLASS}>{propertyValue}</td>
						</tr>
					))}
				</tbody>
			</ScrollingTable>
		</li>
	)
}

// a type role's values as an inline style. Tailwind does not scan this folder and emits a role's class only if an app
// file writes it, so the sample sets the values those classes give
function toTypeRoleStyle(typeRole: TypeRole): CSSProperties {
	return {
		margin: 0,
		fontFamily: fontFamilies[typeRole.family].stack,
		fontSize: `${typeRole.fontSizeRem}rem`,
		lineHeight: `${typeRole.lineHeightRem}rem`,
		fontWeight: typeRole.fontWeight,
		letterSpacing: toLetterSpacing(typeRole),
		textTransform: typeRole.isUppercase ? "uppercase" : "none",
	}
}

// a type role's letter spacing in em, or normal if the role sets none
function toLetterSpacing(typeRole: TypeRole): string {
	return typeRole.letterSpacingEm === undefined ? "normal" : `${typeRole.letterSpacingEm}em`
}

// a type role's values, as pairs of a property name and its value
function toTypeRoleRows(typeRole: TypeRole): [string, string][] {
	return [
		["Family", fontFamilies[typeRole.family].name],
		["Size", toRemAndPixels(typeRole.fontSizeRem)],
		["Line height", toRemAndPixels(typeRole.lineHeightRem)],
		["Weight", String(typeRole.fontWeight)],
		["Letter spacing", toLetterSpacing(typeRole)],
		["Classes", typeRole.className],
		["Description", typeRole.description],
	]
}
