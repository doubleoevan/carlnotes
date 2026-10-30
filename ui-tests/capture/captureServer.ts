// the server that a capture page loads stories from: the built component browser at /nightshift/, and the web app's
// public folder at the root, as the site serves both, so a story's root-relative image loads the way it does in
// production
import { posix } from "node:path"

/** The folders that a capture server serves: the built component browser and the web app's public folder. */
export type CaptureServerFolders = { componentBrowserFolder: string; publicFolder: string }

/** A running capture server: its origin, and how to stop it. */
export type CaptureServer = { origin: string; stop: () => void }

/** The folders that the site serves the component browser and the public files from. */
export const SITE_CAPTURE_SERVER_FOLDERS: CaptureServerFolders = {
	componentBrowserFolder: "apps/web/dist/nightshift",
	publicFolder: "apps/web/public",
}

// the url path that the site serves the component browser after
const COMPONENT_BROWSER_PATH_PREFIX = "/nightshift/"

/**
 * Starts a capture server on a free loopback port, serving the component browser and the public folder to this machine
 * alone.
 */
export function startCaptureServer(captureServerFolders: CaptureServerFolders): CaptureServer {
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: (request) => serveCaptureFile(new URL(request.url).pathname, captureServerFolders),
	})
	return { origin: server.url.origin, stop: () => void server.stop(true) }
}

// the file that a path names, or a 404 for a path outside both folders or a file that does not exist
async function serveCaptureFile(pathname: string, captureServerFolders: CaptureServerFolders): Promise<Response> {
	const filePath = toImageCaptureFilePath(pathname, captureServerFolders)
	const file = filePath ? Bun.file(filePath) : null
	if (!file || !(await file.exists())) {
		return new Response("not found", { status: 404 })
	}
	return new Response(file)
}

// the file that a path names: under the component browser's folder, or under the public folder. null for a path that
// climbs out of its folder
function toImageCaptureFilePath(pathname: string, captureServerFolders: CaptureServerFolders): string | null {
	// a path that does not decode, or that climbs out of its folder, names no file
	const decodedPath = toDecodedPath(pathname)
	const normalizedPath = decodedPath === null ? null : posix.normalize(decodedPath)
	if (normalizedPath === null || normalizedPath.split("/").includes("..")) {
		return null
	}

	// the component browser's files, with its index for the folder itself, and every other path from the public folder
	if (normalizedPath.startsWith(COMPONENT_BROWSER_PATH_PREFIX)) {
		const relativePath = normalizedPath.slice(COMPONENT_BROWSER_PATH_PREFIX.length) || "index.html"
		return posix.join(captureServerFolders.componentBrowserFolder, relativePath)
	}
	return posix.join(captureServerFolders.publicFolder, normalizedPath)
}

// a request path with its percent-encoding decoded, or null for an encoding that is not valid
function toDecodedPath(pathname: string): string | null {
	try {
		return decodeURIComponent(pathname)
	} catch {
		return null
	}
}
