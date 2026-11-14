import { createRouter } from "@tanstack/react-router"
import { configureWebApiClient } from "./lib/webApiClient"
import { RouteErrorPage } from "./pages/RouteErrorPage"
import { routeTree } from "./routeTree.gen"

// configure the api client. this module loads before any route on the server and in the browser
configureWebApiClient()

/**
 * Creates the router from the generated route tree, with the error a route shows when it fails.
 */
export function getRouter() {
	return createRouter({ routeTree, scrollRestoration: true, defaultErrorComponent: RouteErrorPage })
}

// the router's types for every Link and navigate. a path that no route serves fails to compile
declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>
	}
}
