// the path a page is reported as, with its ids and its slug replaced by their route's shapes

// the routes whose second segment is an id, and the shape each one reports as
const ROUTE_ID_SHAPES = new Map([
	["topics", ":id"],
	["profiles", ":userId"],
	["teams", ":teamId"],
	["invite", ":token"],
	["podcast-feeds", ":token"],
])

// the routes whose segment after the id is the page's name as a slug, and the shape it reports as
const ROUTE_SLUG_SHAPES = new Map([["topics", ":slug"]])

/**
 * Returns the path as a report names it, with an id segment and a topic's slug replaced by their route's shapes.
 */
export function toReportedPath(pathname: string): string {
	// read the route and what follows it, leaving a path with neither alone
	const [, route, idSegment, ...restSegments] = pathname.split("/")
	const idShape = route ? ROUTE_ID_SHAPES.get(route) : undefined
	if (!route || !idShape || !idSegment) {
		return pathname
	}
	// replace the slug after a topic's id with the slug shape. the slug is the topic's name
	const [slugSegment, ...laterSegments] = restSegments
	const slugShape = ROUTE_SLUG_SHAPES.get(route)
	const reportedSegments = slugShape && slugSegment ? [slugShape, ...laterSegments] : restSegments
	return ["", route, idShape, ...reportedSegments].join("/")
}
