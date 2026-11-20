// the child process that draws one card element to a png for its parent, which cardElementPngProcess.ts starts. the
// draw's memory goes back to the system when the process exits, which a thread's memory does not
import { toCardElementPng } from "./cardElementPng"

// what the parent sends: the element and the size, as toCardElementPng takes them
type DrawRequest = Parameters<typeof toCardElementPng>[0]

// draw what the parent asks for and reply with the png, or with the reason the draw failed
process.on("message", async (drawRequest: DrawRequest) => {
	try {
		process.send?.({ status: "drawn", png: await toCardElementPng(drawRequest) })
	} catch (error) {
		process.send?.({ status: "failed", reason: error instanceof Error ? error.message : String(error) })
	}
})

// the fonts are read, so the parent may send its element
process.send?.({ status: "ready" })
