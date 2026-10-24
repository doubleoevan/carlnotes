// each type role resolves to the native style its Nightshift definition gives
import { expect, test } from "bun:test"
import { toTypeRoleStyle } from "./typeRoleStyles"

// a display role reads the display family at its rem values resolved to pixels
test("the display role resolves the display family and its sizes", () => {
	expect(toTypeRoleStyle("display")).toEqual({
		fontFamily: "Architects Daughter",
		fontSize: 36,
		lineHeight: 45,
		fontWeight: 400,
	})
})

// a sans role has the weight that selects its face
test("the label role resolves Karla at the semibold weight", () => {
	expect(toTypeRoleStyle("label")).toEqual({
		fontFamily: "Karla",
		fontSize: 14,
		lineHeight: 20,
		fontWeight: 600,
	})
})

// the uppercase role has its transform and its letter spacing in pixels
test("the section label role resolves its transform and spacing", () => {
	expect(toTypeRoleStyle("sectionLabel")).toEqual({
		fontFamily: "Architects Daughter",
		fontSize: 12,
		lineHeight: 16,
		fontWeight: 400,
		letterSpacing: 0.3,
		textTransform: "uppercase",
	})
})
