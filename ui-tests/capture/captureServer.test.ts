// the capture server over a temporary component browser and public folder: a story iframe, a root-relative image, a
// missing file, and a path that climbs out of its folder
import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { posix } from "node:path"
import { type CaptureServer, startCaptureServer } from "./captureServer"

// the temporary folders and the server over them
let testFolder = ""
let captureServer: CaptureServer

// a component browser with its iframe page, and a public folder with an image
beforeAll(() => {
	testFolder = mkdtempSync(posix.join(tmpdir(), "capture-server-"))
	mkdirSync(posix.join(testFolder, "nightshift"))
	mkdirSync(posix.join(testFolder, "public"))
	writeFileSync(posix.join(testFolder, "nightshift", "iframe.html"), "<html>story</html>")
	writeFileSync(posix.join(testFolder, "public", "carl-hero.png"), "image")
	captureServer = startCaptureServer({
		componentBrowserFolder: posix.join(testFolder, "nightshift"),
		publicFolder: posix.join(testFolder, "public"),
	})
})

// the server stops and the folders go
afterAll(() => {
	captureServer.stop()
	rmSync(testFolder, { recursive: true, force: true })
})

// the story iframe comes from the component browser, and a root-relative image from the public folder
test("a story's iframe and a root-relative image load the way the site serves them", async () => {
	const iframeResponse = await fetch(`${captureServer.origin}/nightshift/iframe.html?id=primitives-button--default`)
	expect(await iframeResponse.text()).toBe("<html>story</html>")
	const imageResponse = await fetch(`${captureServer.origin}/carl-hero.png`)
	expect(await imageResponse.text()).toBe("image")
})

// a missing file, a path that climbs out of its folder, and a path that does not decode are all not found
test("a missing file, a climbing path, and a path that does not decode are not found", async () => {
	expect((await fetch(`${captureServer.origin}/missing.png`)).status).toBe(404)
	expect((await fetch(`${captureServer.origin}/nightshift/%2E%2E/%2E%2E/package.json`)).status).toBe(404)
	expect((await fetch(`${captureServer.origin}/nightshift/%E0%A4%A.html`)).status).toBe(404)
})
