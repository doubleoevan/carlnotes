// a small server that drains as the api's entry does, which drain.test.ts starts as a process of its own: the
// readiness check, a slow route, an event stream, and the SIGTERM handler, with a flush that prints a line
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { drain, endStreamOnDrain, isDraining, readDrainSettings, rememberListeningServer } from "./drain"

const server = new Hono()
	// ready until the drain starts
	.get("/ready", (context) => context.json({ status: isDraining() ? "draining" : "ok" }, isDraining() ? 503 : 200))
	// a request that takes as long as its query says
	.get("/slow", async (context) => {
		await Bun.sleep(Number(context.req.query("ms")))
		return context.text("finished")
	})
	// an event stream that stays open until its client leaves or a drain ends it
	.get("/events", (context) =>
		streamSSE(context, async (stream) => {
			await stream.writeSSE({ event: "open", data: "" })
			await new Promise<void>((resolve) => {
				const stopEndingOnDrain = endStreamOnDrain(() => {
					void stream.close()
					resolve()
				})

				// a client that leaves takes its stream off the drain's list
				stream.onAbort(() => {
					stopEndingOnDrain()
					resolve()
				})
			})
		}),
	)

// drain on SIGTERM as the api's entry does, then exit
process.once("SIGTERM", () => {
	const flush = async (): Promise<void> => console.log("flushed")
	void drain({ ...readDrainSettings(), flush }).finally(() => process.exit(0))
})

// the server Bun passes with each request, as far as the drain reads it
type BunServer = Parameters<typeof rememberListeningServer>[0]

export default {
	port: Number(Bun.env.PORT),
	fetch: (request: Request, bunServer?: BunServer): Response | Promise<Response> => {
		rememberListeningServer(bunServer)
		return server.fetch(request, bunServer)
	},
}
