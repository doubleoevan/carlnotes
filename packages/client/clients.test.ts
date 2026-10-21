// every client module loads with no window, as on a server render
import { expect, test } from "bun:test"

// the test runner has no window, like a server render
test("every client module loads without a window", async () => {
	expect(typeof globalThis.window).toBe("undefined")

	// import every client module in this folder
	const clientFileNames = Array.from(new Bun.Glob("*Client.ts").scanSync({ cwd: import.meta.dir }))
	const clientModules = await Promise.all(clientFileNames.map((clientFileName) => import(`./${clientFileName}`)))

	// the folder has client modules, and each one exports something
	expect(clientModules.length).toBeGreaterThan(0)
	for (const clientModule of clientModules) {
		expect(Object.keys(clientModule).length).toBeGreaterThan(0)
	}
})
