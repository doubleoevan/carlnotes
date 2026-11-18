// Bound memory and temporary storage before a film can publish its files.
import { execFile } from "node:child_process"
import { lstat, readdir } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"

import { toPositiveInteger } from "@carlnotes/server/envSettings"

const execute = promisify(execFile)

const MAX_MEMORY_MIB = 6 * 1024
const MAX_DISK_MIB = 1024
const SAMPLE_INTERVAL_MS = 1000
const SAMPLE_TIMEOUT_MS = 5000

/** Counts resident memory for the root process and its descendants, including helper process groups. */
export async function readFilmProcessTree(
	root: number,
	signal?: AbortSignal,
): Promise<{ ids: Set<number>; rss: number }> {
	const { stdout } = await execute("ps", ["-axo", "pid=,ppid=,rss="], {
		signal,
		timeout: SAMPLE_TIMEOUT_MS,
		maxBuffer: 4 * 1024 * 1024,
	})
	const rows = stdout
		.trim()
		.split("\n")
		.map((line) => line.trim().split(/\s+/u).map(Number))
	const ids = new Set([root])
	let previous = 0
	while (previous !== ids.size) {
		previous = ids.size
		for (const [pid, parent] of rows) {
			if (pid && parent && ids.has(parent)) {
				ids.add(pid)
			}
		}
	}
	const rss = rows.reduce((total, [pid, , size]) => total + (pid && ids.has(pid) ? (size ?? 0) : 0), 0)
	if (!rows.some(([pid]) => pid === root)) {
		throw Error("Film process is missing from the resource sample")
	}
	return { ids, rss }
}

// Files can disappear between a directory listing and the next stat as a shot completes.
async function allocatedBytes(path: string, signal: AbortSignal): Promise<number> {
	signal.throwIfAborted()
	try {
		const entry = await lstat(path)
		let bytes = entry.blocks * 512
		if (entry.isDirectory()) {
			for (const child of await readdir(path)) {
				bytes += await allocatedBytes(join(path, child), signal)
			}
		}
		return bytes
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return 0
		}
		throw error
	}
}

/** Checks resident memory and temporary disk usage within a bounded sampling interval. */
export async function checkVideoRenderResourceLimits(
	pid: number,
	directory: string,
	parent?: AbortSignal,
): Promise<Set<number>> {
	// stop waiting for a slow filesystem call and cancel the process-table read when the sample expires
	const deadline = AbortSignal.timeout(SAMPLE_TIMEOUT_MS)
	const signal = parent ? AbortSignal.any([parent, deadline]) : deadline
	signal.throwIfAborted()
	const stopped = Promise.withResolvers<never>()
	const onAbort = (): void => stopped.reject(signal.reason)
	signal.addEventListener("abort", onAbort, { once: true })
	try {
		const [tree, bytes] = await Promise.race([
			Promise.all([readFilmProcessTree(pid, signal), allocatedBytes(directory, signal)]),
			stopped.promise,
		])
		return checkMeasuredVideoRenderLimits(tree, bytes)
	} finally {
		signal.removeEventListener("abort", onAbort)
	}
}

// compare the completed sample with the render's configured limits
function checkMeasuredVideoRenderLimits(tree: { ids: Set<number>; rss: number }, bytes: number): Set<number> {
	const memoryMiB = Math.min(MAX_MEMORY_MIB, toPositiveInteger(Bun.env.TOPIC_VIDEO_MEMORY_LIMIT_MIB, MAX_MEMORY_MIB))
	const diskMiB = Math.min(MAX_DISK_MIB, toPositiveInteger(Bun.env.TOPIC_VIDEO_DISK_LIMIT_MIB, MAX_DISK_MIB))
	if (tree.rss > memoryMiB * 1024) {
		throw Error(`Film exceeded its ${memoryMiB} MiB memory limit`)
	}
	if (bytes > diskMiB * 1024 * 1024) {
		throw Error(`Film exceeded its ${diskMiB} MiB temporary disk limit`)
	}
	return tree.ids
}

/** Cancels the live encode on exhaustion and waits for the writer to exit before cleanup or publication. */
export async function withVideoRenderResourceLimits<T>(
	directory: string,
	parent: AbortSignal | undefined,
	render: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	// sample before admission, throughout encoding and before releasing the files for upload
	const stop = new AbortController()
	const signal = parent ? AbortSignal.any([parent, stop.signal]) : stop.signal
	let pending: Promise<void> | undefined
	const check = (): Promise<void> => {
		pending ??= checkVideoRenderResourceLimits(process.pid, directory, signal)
			.then(() => undefined)
			.catch((error: unknown) => stop.abort(error))
			.finally(() => {
				pending = undefined
			})
		return pending
	}
	signal.throwIfAborted()
	await check()
	signal.throwIfAborted()
	const timer = setInterval(check, SAMPLE_INTERVAL_MS)
	try {
		const result = await render(signal)
		await pending
		await check()
		signal.throwIfAborted()
		return result
	} catch (error) {
		signal.throwIfAborted()
		throw error
	} finally {
		clearInterval(timer)
		stop.abort()
		await pending
	}
}
