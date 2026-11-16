// serves one blinded phone review on the QA Mac and keeps labels in a private local file
import { readFile, rename, writeFile } from "node:fs/promises"
import { db } from "@carlnotes/db"
import { sampleTopicMemoryLabels, scoreTopicMemoryLabels } from "./topicMemoryLabelSamples"

const [address, path, reviewId, portArgument = "3102"] = Bun.argv.slice(2)
const port = Number(portArgument)
if (
	!address ||
	!/^(127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)$/.test(address) ||
	!path ||
	!reviewId ||
	!/^[a-zA-Z0-9-]{24,80}$/.test(reviewId) ||
	!Number.isInteger(port) ||
	port < 1024 ||
	port > 65535 ||
	Bun.env.DOPPLER_CONFIG !== "dev" ||
	!Bun.env.LITELLM_PUBLIC_KEY
) {
	throw new Error("Run with dev Doppler, a local IP, a private dataset path, and a random review ID")
}

// reuse a dataset so refreshing never changes assigned pair ids
const stored = Bun.file(path)
const dataset: Awaited<ReturnType<typeof sampleTopicMemoryLabels>> = (await stored.exists())
	? await stored.json()
	: await sampleTopicMemoryLabels(Bun.env.LITELLM_PUBLIC_KEY).finally(() => db.$client.end())
if (!(await stored.exists())) {
	await writeFile(path, JSON.stringify(dataset), { mode: 0o600, flag: "wx" })
}
const labelsPath = `${path}.labels.json`
const labelFile = Bun.file(labelsPath)
const labels: Record<string, boolean> = (await labelFile.exists()) ? JSON.parse(await readFile(labelsPath, "utf8")) : {}
const sampleIds = new Set(dataset.samples.map(({ id }) => id))
const pairs = dataset.samples.map(({ action: _action, ...pair }) => pair)
const reviewPath = `/review/${reviewId}`
const origin = `http://${address}:${port}`
const headers = {
	"Cache-Control": "no-store",
	"Referrer-Policy": "no-referrer",
	"X-Content-Type-Options": "nosniff",
}
const reviewHtml = await Bun.file(new URL("./topicMemoryLabelReview.html", import.meta.url)).text()
const htmlHeaders = {
	...headers,
	"Content-Type": "text/html; charset=utf-8",
	"Content-Security-Policy":
		"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
}
let pendingSave = Promise.resolve()

Bun.serve({
	hostname: address,
	port,
	maxRequestBodySize: 2048,
	async fetch(request) {
		const url = new URL(request.url)
		if (url.origin === origin && url.pathname === `${reviewPath}/results` && request.method === "GET") {
			return Response.json(scoreTopicMemoryLabels(dataset, labels), { headers })
		}
		if (url.origin !== origin || url.pathname !== reviewPath) {
			return new Response("Page unavailable", { status: 404 })
		}
		if (request.method === "GET") {
			const data = JSON.stringify({ pairs, labels }).replaceAll("<", "\\u003c")
			return new Response(
				reviewHtml.replace('"REVIEW_DATA"', () => data),
				{ headers: htmlHeaders },
			)
		}
		if (request.method !== "POST" || request.headers.get("origin") !== origin) {
			return new Response("Request unavailable", { status: 403 })
		}

		// serialize saves and reject unknown IDs or non-boolean labels before touching disk
		const payload: unknown = await request.json().catch(() => null)
		if (
			!payload ||
			typeof payload !== "object" ||
			!("id" in payload) ||
			typeof payload.id !== "string" ||
			!sampleIds.has(payload.id) ||
			!("same" in payload) ||
			typeof payload.same !== "boolean"
		) {
			return new Response("Invalid label", { status: 400 })
		}
		const { id, same } = payload
		const save = pendingSave.then(async () => {
			const next = { ...labels, [id]: same }
			const temporary = `${labelsPath}.${crypto.randomUUID()}`
			await writeFile(temporary, JSON.stringify(next), { mode: 0o600, flag: "wx" })
			await rename(temporary, labelsPath)
			labels[id] = same
		})
		pendingSave = save.catch(() => undefined)
		try {
			await save
			console.log(JSON.stringify(scoreTopicMemoryLabels(dataset, labels)))
			return new Response(null, { status: 204, headers })
		} catch {
			return new Response("Could not save. Try again.", { status: 500, headers })
		}
	},
})
console.log(JSON.stringify(scoreTopicMemoryLabels(dataset, labels)))
console.log(`Review at ${origin}${reviewPath}`)
