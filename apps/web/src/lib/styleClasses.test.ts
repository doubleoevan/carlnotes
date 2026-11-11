// the shared class strings that copy a Nightshift type role stay in step with that role, and the two buttons of a
// page's top row share one size
import { expect, test } from "bun:test"
import { typeRoles } from "@carlnotes/nightshift/typography"
import { HIGHLIGHTED_PAGE_BUTTON_CLASS, LOGO_CLASS, PLAIN_PAGE_BUTTON_CLASS, SECTION_LABEL_CLASS } from "./styleClasses"

// the size classes that a top row's plain button and its highlighted button both hold
const PAGE_BUTTON_SIZE_CLASSES = ["h-9", "px-3", "gap-2", "rounded-md", "border", "text-sm", "font-medium"]

// the section label class is the sectionLabel type role with the muted color in front of it
test("SECTION_LABEL_CLASS ends with the sectionLabel type role's classes", () => {
	expect(SECTION_LABEL_CLASS.endsWith(` ${typeRoles.sectionLabel.className}`)).toBe(true)
})

// the logo class is the logo type role's classes
test("LOGO_CLASS is the logo type role's classes", () => {
	expect(LOGO_CLASS).toBe(typeRoles.logo.className)
})

// both buttons of a page's top row hold the same size classes, and none that changes at a breakpoint
test("the plain and the highlighted page button share one size at every width", () => {
	for (const pageButtonClass of [PLAIN_PAGE_BUTTON_CLASS, HIGHLIGHTED_PAGE_BUTTON_CLASS]) {
		const classNames = pageButtonClass.split(" ")
		expect(classNames).toEqual(expect.arrayContaining(PAGE_BUTTON_SIZE_CLASSES))
		expect(classNames.filter((className) => /^(max-)?(sm|md|lg|xl):/.test(className))).toEqual([])
	}
})
