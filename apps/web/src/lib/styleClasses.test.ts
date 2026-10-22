// the shared class strings that copy a Nightshift type role stay in step with that role
import { expect, test } from "bun:test"
import { typeRoles } from "@carlnotes/nightshift/typography"
import { SECTION_LABEL_CLASS } from "./styleClasses"

// the section label class is the sectionLabel type role with the muted color in front of it
test("SECTION_LABEL_CLASS ends with the sectionLabel type role's classes", () => {
	expect(SECTION_LABEL_CLASS.endsWith(` ${typeRoles.sectionLabel.className}`)).toBe(true)
})
