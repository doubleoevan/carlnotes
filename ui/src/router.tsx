import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

/**
 * Creates the router from the generated route tree.
 */
export function getRouter() {
	return createRouter({ routeTree, scrollRestoration: true })
}

// the router's types for every Link and navigate. a path that no route serves fails to compile
declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>
	}
}
