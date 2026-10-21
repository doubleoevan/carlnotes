// the text an image shows, read with text recognition in this process
import { dirname, join } from "node:path"
import { createWorker, OEM, type Worker } from "tesseract.js"

// the English data the text recognition worker reads, from the installed package and never from a CDN
const ENGLISH_DATA_PATH = join(
	dirname(Bun.resolveSync("@tesseract.js-data/eng/package.json", import.meta.dir)),
	"4.0.0_best_int",
)

// the one text recognition worker this process reads with, created on the first read
let textRecognitionWorkerPromise: Promise<Worker> | null = null

/**
 * Returns the text an image shows, read with text recognition, or an empty string for an image with no text.
 * The worker is created on the first read and reused after. A worker that failed to start is started again next time.
 */
export async function readImageText(imageBytes: Uint8Array): Promise<string> {
	// start the worker once. the worker writes no data file of its own
	textRecognitionWorkerPromise ??= createWorker("eng", OEM.LSTM_ONLY, {
		langPath: ENGLISH_DATA_PATH,
		cacheMethod: "none",
		gzip: true,
	}).catch((error: unknown) => {
		textRecognitionWorkerPromise = null
		throw error
	})

	// read the image's text
	const textRecognitionWorker = await textRecognitionWorkerPromise
	const recognizeResult = await textRecognitionWorker.recognize(Buffer.from(imageBytes))
	return recognizeResult.data.text.trim()
}

/**
 * Stops this process's text recognition worker.
 */
export async function stopTextRecognitionWorker(): Promise<void> {
	// stop the worker if one started, and forget it
	const textRecognitionWorker = await textRecognitionWorkerPromise?.catch(() => null)
	textRecognitionWorkerPromise = null
	await textRecognitionWorker?.terminate()
}
