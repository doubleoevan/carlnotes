import { defineRouteMiddleware } from "@astrojs/starlight/route-data"

/**
 * Points the header wordmark at the app instead of the docs home, the way a product's docs site usually reads.
 * The docs home stays reachable from the first sidebar entry.
 */
export const onRequest = defineRouteMiddleware((context) => {
	context.locals.starlightRoute.siteTitleHref = "/"
})
