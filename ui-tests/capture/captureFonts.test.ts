// the vendored fonts against the app's Google Fonts stylesheet: every family and weight that the stylesheet asks for
// has a face in the capture stylesheet, and every face's file is in the repo
import { expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { posix } from "node:path"
import { FONT_STYLESHEET_URL } from "@carlnotes/nightshift/typography"
import { FONTS_FOLDER } from "../imageCaptures"

// the stylesheet that an image capture fulfills the Google Fonts stylesheet request with
const CAPTURE_FONT_STYLESHEET = readFileSync(posix.join(FONTS_FOLDER, "fonts.css"), "utf8")

// each family and weight that the app's stylesheet url asks for. a family with no weights asks for 400
function toRequestedFaces(fontStylesheetUrl: string): string[] {
	return new URL(fontStylesheetUrl).searchParams.getAll("family").flatMap((familyParameter) => {
		const [familyName = "", weightText] = familyParameter.split(":wght@")
		const weights = weightText ? weightText.split(";") : ["400"]
		return weights.map((weight) => `${familyName.replaceAll("+", " ")} ${weight}`)
	})
}

// each face that the capture stylesheet declares, as a family and a weight, with its file
function toVendoredFaces(): { faceName: string; fileName: string }[] {
	return [...CAPTURE_FONT_STYLESHEET.matchAll(/@font-face \{([^}]*)\}/g)].map(([, faceBlock = ""]) => {
		const familyName = /font-family: "([^"]+)"/.exec(faceBlock)?.[1]
		const weight = /font-weight: (\d+)/.exec(faceBlock)?.[1]
		const fileName = /url\("\/ui-tests-fonts\/([^"]+)"\)/.exec(faceBlock)?.[1] ?? ""
		return { faceName: `${familyName} ${weight}`, fileName }
	})
}

// every requested face is vendored, and every vendored face's file exists
test("every family and weight that the app's stylesheet loads is vendored with its file", () => {
	// every requested face is declared
	const vendoredFaces = toVendoredFaces()
	const vendoredFaceNames = vendoredFaces.map((vendoredFace) => vendoredFace.faceName)
	for (const requestedFace of toRequestedFaces(FONT_STYLESHEET_URL)) {
		expect(vendoredFaceNames).toContain(requestedFace)
	}

	// every declared face's file is in the repo
	for (const vendoredFace of vendoredFaces) {
		expect(existsSync(posix.join(FONTS_FOLDER, vendoredFace.fileName))).toBe(true)
	}
})
