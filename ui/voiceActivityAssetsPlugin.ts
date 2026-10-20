// the vite plugin that serves the voice activity detector's runtime files from the app itself: its worklet, its Silero
// model, and onnxruntime's WebAssembly, copied out of node_modules into the client build under /assets/, and served
// straight from node_modules in dev
import { readFileSync } from "node:fs"
import path from "node:path"
import type { Plugin } from "vite"

// the two packages' folders, read from the repo's one node_modules
const NODE_MODULES_ROOT = path.resolve(__dirname, "../node_modules")
const VAD_WEB_ROOT = path.join(NODE_MODULES_ROOT, "@ricky0123/vad-web")
const ONNXRUNTIME_WEB_ROOT = path.join(NODE_MODULES_ROOT, "onnxruntime-web")

// the files the detector fetches at runtime, by the name it fetches each under, with the folder it comes from. a map,
// so a lookup never reaches an inherited key such as constructor or __proto__
const VOICE_ACTIVITY_ASSET_SOURCES = new Map([
	["vad.worklet.bundle.min.js", path.join(VAD_WEB_ROOT, "dist")],
	["silero_vad_v5.onnx", path.join(VAD_WEB_ROOT, "dist")],
	["ort-wasm-simd-threaded.wasm", path.join(ONNXRUNTIME_WEB_ROOT, "dist")],
	["ort-wasm-simd-threaded.mjs", path.join(ONNXRUNTIME_WEB_ROOT, "dist")],
])

// the content type each file is served with in dev, octet-stream if its extension is not listed
const VOICE_ACTIVITY_ASSET_CONTENT_TYPES: Record<string, string> = {
	".js": "text/javascript",
	".mjs": "text/javascript",
	".wasm": "application/wasm",
}

/**
 * Serves the voice activity detector's files under a folder named for both packages' versions, so an upgrade changes
 * the path and no cached copy outlives it, and defines that path for the detector's module.
 */
export function voiceActivityAssetsPlugin(): Plugin {
	// the folder under /assets/ that the files are served from
	const assetFolder = `assets/voice-activity-${readPackageVersion(VAD_WEB_ROOT)}-${readPackageVersion(ONNXRUNTIME_WEB_ROOT)}`
	return {
		name: "voice-activity-assets",
		config: () => ({ define: { __VOICE_ACTIVITY_ASSET_PATH__: JSON.stringify(`/${assetFolder}/`) } }),
		// dev serves each file straight from node_modules
		configureServer(server): void {
			server.middlewares.use(`/${assetFolder}`, (request, response, next) => {
				// a name the detector does not fetch falls through to vite
				const assetName = path.basename(request.url ?? "")
				const sourceFolder = VOICE_ACTIVITY_ASSET_SOURCES.get(assetName)
				if (!sourceFolder) {
					next()
					return
				}

				// the file, with its content type
				response.setHeader(
					"Content-Type",
					VOICE_ACTIVITY_ASSET_CONTENT_TYPES[path.extname(assetName)] ?? "application/octet-stream",
				)
				response.end(readFileSync(path.join(sourceFolder, assetName)))
			})
		},
		// the client build copies each file under its fixed name
		applyToEnvironment: (environment) => environment.name === "client",
		generateBundle(): void {
			for (const [assetName, sourceFolder] of VOICE_ACTIVITY_ASSET_SOURCES) {
				this.emitFile({
					type: "asset",
					fileName: `${assetFolder}/${assetName}`,
					source: readFileSync(path.join(sourceFolder, assetName)),
				})
			}
		},
	}
}

// a package's version, read from its package.json
function readPackageVersion(packageRoot: string): string {
	return (JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")) as { version: string }).version
}
