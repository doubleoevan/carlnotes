// voiceActivityAssetsPlugin tests: the dev server serves the detector's own files and passes every other name on to
// vite, an inherited object key included
import { expect, test } from "bun:test"
import type { Connect, ViteDevServer } from "vite"
import { voiceActivityAssetsPlugin } from "./voiceActivityAssetsPlugin"

// what the dev middleware did with one request: the content type and the file it sent, or a pass on to vite
type AssetRequestOutcome = { contentType: string | null; body: Buffer | null; isPassedOn: boolean }

// run one request through the middleware the plugin mounts on the dev server
function requestVoiceActivityAsset(url: string): AssetRequestOutcome {
	// capture the middleware from a dev server that holds only its middleware stack
	const assetMiddlewares: Connect.NextHandleFunction[] = []
	const devServer = {
		middlewares: { use: (_route: string, middleware: Connect.NextHandleFunction) => assetMiddlewares.push(middleware) },
	}
	const configureServer = voiceActivityAssetsPlugin().configureServer as (server: ViteDevServer) => void
	configureServer(devServer as unknown as ViteDevServer)

	// record the content type and the body the middleware sends, or whether it passes the request on
	const assetRequestOutcome: AssetRequestOutcome = { contentType: null, body: null, isPassedOn: false }
	const response = {
		setHeader: (_name: string, contentType: string) => {
			assetRequestOutcome.contentType = contentType
		},
		end: (body: Buffer) => {
			assetRequestOutcome.body = body
		},
	}
	assetMiddlewares[0]?.(
		{ url } as Connect.IncomingMessage,
		response as unknown as Parameters<Connect.NextHandleFunction>[1],
		() => {
			assetRequestOutcome.isPassedOn = true
		},
	)
	return assetRequestOutcome
}

// a file the detector fetches is read from node_modules with its content type
test("a detector file is served with its content type", () => {
	const assetRequestOutcome = requestVoiceActivityAsset("/vad.worklet.bundle.min.js")
	expect(assetRequestOutcome.isPassedOn).toBe(false)
	expect(assetRequestOutcome.contentType).toBe("text/javascript")
	expect(assetRequestOutcome.body?.length).toBeGreaterThan(0)
})

// a name an object inherits is no asset, so it passes on to vite and reads no file
test("an inherited key passes on to vite", () => {
	for (const inheritedKey of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
		expect(requestVoiceActivityAsset(`/${inheritedKey}`)).toEqual({ contentType: null, body: null, isPassedOn: true })
	}
})

// any other name passes on to vite
test("an unknown name passes on to vite", () => {
	expect(requestVoiceActivityAsset("/index.html")).toEqual({ contentType: null, body: null, isPassedOn: true })
})
