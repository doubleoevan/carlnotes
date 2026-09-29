// the route tests' router, loaded at one path the way the server loads one request
import { type AnyRouter, createMemoryHistory, createRouter } from "@tanstack/react-router"
import { routeTree } from "../routeTree.gen"

// a redirect the load threw, or the status of a rendered page, as the server load records it
export type ServerLoadResult =
	| { type: "redirect"; redirect: { options: { statusCode?: number }; headers: Headers } }
	| { type: "render"; status: number }

/**
 * Loads a router at one path the way the server loads a request, and returns it with the result the load recorded.
 */
export async function loadRouter(path: string): Promise<{ router: AnyRouter; serverLoadResult?: ServerLoadResult }> {
	// load the router at the path
	const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) })
	await router.load()

	// read the result the load recorded. _serverResult is a private field of @tanstack/router-core 1.171.32
	const { _serverResult: serverLoadResult } = router as unknown as { _serverResult?: ServerLoadResult }
	return { router, serverLoadResult }
}
