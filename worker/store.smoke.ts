// a live smoke test for the resource-content object-storage round-trip: upload Markdown, read it back, verify, then delete.
// run it with: bun run smoke:store. needs the S3_* bucket config and Doppler secrets
import { deleteResourceContent, getResourceContent, toResourceContentKey, uploadResourceContent } from "./store"

// upload content for a fake resource id, read it back, and check the key, size, and body all round-trip
async function smokeTest(): Promise<number> {
	// a fake resource id and some Markdown to round-trip through object storage
	const resourceId = `smoke-${Date.now()}`
	const markdown = `# resource content smoke\n\nround-tripped at ${new Date().toISOString()}`

	// upload, read back, and verify, then always delete the object
	try {
		const { contentKey, bytes } = await uploadResourceContent(resourceId, markdown)
		const readBack = await getResourceContent(contentKey)

		// the key, size, and content all round-trip through object storage
		const results: [string, boolean][] = [
			["key matches resourceContentKey", contentKey === toResourceContentKey(resourceId)],
			["bytes match the encoded length", bytes === new TextEncoder().encode(markdown).byteLength],
			["read-back content matches", readBack === markdown],
		]

		// print the smoke test report and return the overall result
		console.log("\n=== resource content store smoke ===")
		let allPassed = true
		for (const [label, pass] of results) {
			console.log(`${pass ? "PASS" : "FAIL"}  ${label}`)
			allPassed = allPassed && pass
		}
		return allPassed ? 0 : 1
	} finally {
		// best-effort delete so a repeated run leaves nothing behind
		await deleteResourceContent(toResourceContentKey(resourceId)).catch(() => {})
	}
}

// run the smoke, then exit because the process would otherwise stay alive
const exitCode = await smokeTest().catch((error) => {
	console.error(error)
	return 1
})
process.exit(exitCode)
