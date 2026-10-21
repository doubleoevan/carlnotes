import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"

/**
 * Renders a node to static markup inside a memory router at /.
 */
export async function renderWithRouter(node: ReactNode): Promise<string> {
	// mount the node as the root route of a memory router at /
	const routeTree = createRootRoute({ component: () => node })
	const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/"] }) })

	// load the route match, then render the router to static markup
	await router.load()
	return renderToStaticMarkup(<RouterProvider router={router} />)
}
