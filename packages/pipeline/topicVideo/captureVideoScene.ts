// the child process that drives the trusted chapter page and pipes each frame to the film encoder

import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { type Browser, chromium, type Page, type Route } from "playwright-core"
import type { VideoSceneDocument } from "./videoSceneBrowser"

export type CaptureChapterInput = { document: VideoSceneDocument; directory: string; bundle: string; output: string }

// a fixed, offline origin lets Chromium apply its normal font, texture and script checks
const origin = "http://film.invalid"
const pageHtml =
	"<!doctype html><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'self'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; font-src 'self'\"><style>@font-face{font-family:Karla;src:url(/font.ttf);font-weight:600}</style><script defer src=\"/bundle.js\"></script>"

/** Loads the approved chapter textures and fonts behind the same offline boundary in capture and QA. */
export async function openVideoScenePage(
	browser: Browser,
	{ directory, document, bundle }: CaptureChapterInput,
): Promise<Page> {
	const page = await browser.newPage({
		viewport: { width: 1280, height: 720 },
		deviceScaleFactor: 1,
		serviceWorkers: "block",
	})
	const files = new Map<string, { path: string; contentType: string }>([
		["/bundle.js", { path: bundle, contentType: "application/javascript" }],
		[
			"/font.ttf",
			{ path: fileURLToPath(new URL("../assets/fonts/Karla-SemiBold.ttf", import.meta.url)), contentType: "font/ttf" },
		],
		["/plate.png", { path: join(directory, "plate.png"), contentType: "image/png" }],
	])
	for (const { sourceImageHash } of document.imageFiles) {
		files.set(`/${sourceImageHash}.jpg`, { path: join(directory, `${sourceImageHash}.jpg`), contentType: "image/jpeg" })
	}
	for (const image of document.plan.sceneImages) {
		if (image.animationFileHash) {
			files.set(`/${image.animationFileHash}.webm`, {
				path: join(directory, `${image.animationFileHash}.webm`),
				contentType: "video/webm",
			})
		}
	}
	await page.route("**/*", async (route) => {
		const url = new URL(route.request().url())
		if (url.origin !== origin) {
			return route.abort()
		}
		if (url.pathname === "/") {
			return route.fulfill({ body: pageHtml, contentType: "text/html" })
		}
		const file = files.get(url.pathname)
		if (!file) {
			return route.abort()
		}
		if (file.contentType === "video/webm") {
			return serveAnimationRange(route, file)
		}

		return route.fulfill(file)
	})
	await page.goto(origin)
	await page.evaluate((data) => window.startVideoScene(data), document)
	return page
}

// Chromium seeks inside only a reviewed local asset, through its ordinary media range requests.
async function serveAnimationRange(route: Route, file: { path: string; contentType: string }): Promise<void> {
	const bytes = Bun.file(file.path)
	const match = /^bytes=(\d+)-(\d*)$/u.exec(route.request().headers().range ?? "")
	if (match) {
		const start = Number(match[1]),
			end = match[2] ? Math.min(Number(match[2]), bytes.size - 1) : bytes.size - 1
		if (start > end) {
			return route.fulfill({ status: 416 })
		}
		return route.fulfill({
			status: 206,
			contentType: file.contentType,
			headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${bytes.size}` },
			body: Buffer.from(await bytes.slice(start, end + 1).arrayBuffer()),
		})
	}
	return route.fulfill(file)
}

/** Writes complete JPEG frames to the supervisor's encoder pipe in scene order. */
async function captureVideoScene(input: CaptureChapterInput, browserEndpoint: string): Promise<void> {
	// connect to the browser owned by the supervisor for this capture
	const browser = await chromium.connect(browserEndpoint)
	try {
		const page = await openVideoScenePage(browser, input)
		for (let frame = 0; frame < input.document.plan.frameCount; frame++) {
			const bytes = await page.evaluate((frame) => window.drawVideoScene(frame), frame)
			await new Promise<void>((resolve, reject) =>
				process.stdout.write(Buffer.from(bytes, "base64"), (error) => (error ? reject(error) : resolve())),
			)
		}
	} finally {
		await browser.close()
	}
}

// read the private capture from disk and deliver its frames to the supervisor
if (import.meta.main) {
	const inputPath = process.argv[2]
	const browserEndpoint = process.env.VIDEO_SCENE_BROWSER_ENDPOINT
	if (!inputPath || !browserEndpoint) {
		throw new Error("Video scene capture requires an input file and a browser connection")
	}
	await captureVideoScene(await Bun.file(inputPath).json(), browserEndpoint)
}
