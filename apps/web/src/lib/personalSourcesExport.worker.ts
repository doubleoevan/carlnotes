// local parsing keeps unselected transcript text off the network and off the UI thread
import { parsePersonalSourcesExport, previewPersonalSourcesTranscript } from "./personalSourcesExport"

// closing the import dialog terminates this worker and releases its parse buffers
self.onmessage = async (event: MessageEvent<{ bytes: ArrayBuffer } | { title: string; text: string }>) => {
	try {
		const preview =
			"bytes" in event.data
				? await parsePersonalSourcesExport(new Uint8Array(event.data.bytes))
				: previewPersonalSourcesTranscript(event.data)
		self.postMessage({ status: "ready", preview })
	} catch {
		// parser errors can quote export content. only a fixed explanation crosses the worker boundary
		self.postMessage({
			status: "error",
			message:
				"This export is unsupported, unsafe, empty, or larger than 10 MiB. Try a smaller export or paste a transcript.",
		})
	}
}
