// the drain in a process of its own, because a drain is once for a process: at SIGTERM readiness fails, a request in
// flight finishes, an event stream ends so its client reconnects, the flush runs, and the process exits. a request
// still in flight at the drain limit is closed
import { afterEach, expect, test } from "bun:test"

// the server processes the tests started, each stopped after its test
const startedProcesses: Bun.Subprocess<"ignore", "pipe", "pipe">[] = []
afterEach(() => {
	for (const startedProcess of startedProcesses.splice(0)) {
		startedProcess.kill("SIGKILL")
	}
})

// a port that nothing listens on
function toFreePort(): number {
	const probeServer = Bun.serve({ port: 0, fetch: () => new Response("") })
	const { port } = probeServer
	void probeServer.stop(true)
	return port ?? 0
}

// start the drain test server with the given waits, and return it with its origin once it answers
async function startDrainTestServer(drainSettings: {
	routingGraceMs: number
	drainLimitMs: number
}): Promise<{ serverProcess: Bun.Subprocess<"ignore", "pipe", "pipe">; origin: string }> {
	const port = toFreePort()
	const serverProcess = Bun.spawn(["bun", new URL("./drainTestServer.ts", import.meta.url).pathname], {
		env: {
			...Bun.env,
			PORT: String(port),
			API_DRAIN_ROUTING_GRACE_MS: String(drainSettings.routingGraceMs),
			API_DRAIN_LIMIT_MS: String(drainSettings.drainLimitMs),
		},
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	})
	startedProcesses.push(serverProcess)

	// wait until the server answers its readiness check
	const origin = `http://127.0.0.1:${port}`
	for (let attempt = 0; attempt < 100; attempt++) {
		const readyResponse = await fetch(`${origin}/ready`).catch(() => null)
		if (readyResponse?.status === 200) {
			return { serverProcess, origin }
		}

		// not listening yet, so ask again shortly
		await Bun.sleep(50)
	}
	throw new Error("the drain test server did not start")
}

test("at SIGTERM readiness fails, a request in flight finishes, a stream ends, and the process flushes and exits", async () => {
	// a server that keeps answering for 400 ms after SIGTERM, with an open event stream and a request of 1.2 seconds
	const { serverProcess, origin } = await startDrainTestServer({ routingGraceMs: 400, drainLimitMs: 10_000 })
	const eventsResponse = await fetch(`${origin}/events`)
	const eventsReader = eventsResponse.body?.getReader()
	const firstChunk = await eventsReader?.read()
	expect(new TextDecoder().decode(firstChunk?.value)).toContain("event: open")
	const whenSlowResponse = fetch(`${origin}/slow?ms=1200`)
	await Bun.sleep(100)

	// the platform stops the replica. it still answers, and its readiness check now fails
	serverProcess.kill("SIGTERM")
	await Bun.sleep(150)
	const drainingResponse = await fetch(`${origin}/ready`)
	expect([drainingResponse.status, await drainingResponse.json()]).toEqual([503, { status: "draining" }])

	// the stream ends cleanly, which is what sends its client back to connect again
	const lastChunk = await eventsReader?.read()
	expect(lastChunk?.done).toBe(true)

	// the request that was in flight when the server stopped listening finishes
	const slowResponse = await whenSlowResponse
	expect([slowResponse.status, await slowResponse.text()]).toEqual([200, "finished"])

	// the process flushes, exits cleanly, and listens no longer
	expect(await serverProcess.exited).toBe(0)
	const output = await new Response(serverProcess.stdout).text()
	expect(output).toContain("flushed")
	expect(output.indexOf("flushed")).toBeLessThan(output.indexOf("draining: done"))
	expect(await fetch(`${origin}/ready`).catch(() => "refused")).toBe("refused")
}, 20_000)

test("a request still in flight at the drain limit is closed, and the process still flushes and exits", async () => {
	// a request of 30 seconds against a drain limit of 300 ms
	const { serverProcess, origin } = await startDrainTestServer({ routingGraceMs: 0, drainLimitMs: 300 })
	const whenSlowResponse = fetch(`${origin}/slow?ms=30000`).then(
		() => "finished",
		() => "closed",
	)
	await Bun.sleep(100)
	serverProcess.kill("SIGTERM")

	// the request is closed, and the process exits long before the request would have finished
	expect(await whenSlowResponse).toBe("closed")
	expect(await serverProcess.exited).toBe(0)
	expect(await new Response(serverProcess.stdout).text()).toContain("flushed")
	expect(await new Response(serverProcess.stderr).text()).toContain("were still in flight after 300 ms")
}, 20_000)
