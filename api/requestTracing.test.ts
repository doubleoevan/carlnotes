// the route a request's transaction is named by, and a request passing through untouched if nothing traces it
import { expect, test } from "bun:test"
import { Hono } from "hono"
import { toRequestRoute, traceRequest } from "./requestTracing"

// an app routed like the api: a sub-app under a prefix, a parameterized route, the api's JSON 404,
// and the ui's catch-all, which renders a topic page and has no route for anything else
function createRoutedApp(requestRoutes: string[]): Hono {
	const faviconsRoute = new Hono().get("/favicons/:id", (context) => context.text("icon"))
	const topicsRoute = new Hono().get("/api/topics/:id", (context) => context.json({}))

	// the first middleware records each request's route once the rest of the chain has responded
	return (
		new Hono()
			.use(async (context, next) => {
				await next()
				requestRoutes.push(toRequestRoute(context))
			})
			// the routes, in the api's order
			.route("/api", faviconsRoute)
			.route("/", topicsRoute)
			.all("/api/*", (context) => context.json({ error: "not found" }, 404))
			.on(["GET", "HEAD"], "*", (context) => context.text("page", context.req.path.startsWith("/topics/") ? 200 : 404))
	)
}

// an api route by its pattern, a page by its route shape, and every page the ui has no route for by one name
test("a request is named by the route that responded", async () => {
	const requestRoutes: string[] = []
	const app = createRoutedApp(requestRoutes)

	// a nested api route, a parameterized one, an unknown api path, a page, and a bot's probe
	const paths = [
		"/api/favicons/abc",
		"/api/topics/abc?sort=new",
		"/api/nope",
		"/topics/5f3c/agents-weekly?ref=x",
		"/wp-admin/setup.php",
	]
	for (const path of paths) {
		await app.request(path)
	}
	expect(requestRoutes).toEqual(["/api/favicons/:id", "/api/topics/:id", "/api/*", "/topics/:id/:slug", "(not found)"])
})

// without Sentry nothing is traced, so the response is the handler's own
test("an untraced request runs as it is", async () => {
	const app = new Hono()
		.use(traceRequest)
		.get("/api/topics/:id", (context) => context.json({ topicId: context.req.param("id") }, 201))
	const response = await app.request("/api/topics/abc")
	expect(response.status).toBe(201)
	expect(await response.json()).toEqual({ topicId: "abc" })
})

// a podcast feed token's routes are named by their patterns, so a trace never includes the token
test("a podcast feed token never reaches a request's name", async () => {
	// an app that keeps the route that each request is named by
	const requestRoutes: string[] = []
	const app = new Hono()
		.use(async (context, next) => {
			await next()
			requestRoutes.push(toRequestRoute(context))
		})
		.get("/podcast-feeds/:tokenFile", (context) => context.text("feed"))
		.get("/api/podcast-feeds/:token/episodes/:id/:file", (context) => context.text("audio"))

	// the feed itself, then one of its podcast episode's files
	await app.request("/podcast-feeds/a-secret-token.xml")
	await app.request("/api/podcast-feeds/a-secret-token/episodes/episode-1/audio.mp3")
	expect(requestRoutes).toEqual(["/podcast-feeds/:tokenFile", "/api/podcast-feeds/:token/episodes/:id/:file"])
})
