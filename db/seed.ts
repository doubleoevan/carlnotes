// dev-only seed with idempotent stub data so the homepage renders before real scans run. it only runs against the dev Doppler environment
import { db } from "./index"
import { findings, resources, scans, sources, subscriptions, topics, users } from "./schema"

// the community owner whose public topics fill the Featured and Popular sections
const COMMUNITY_USER_ID = "usr_community"

// the kind unions come straight off the insert types so a bad literal fails the type check
type SeedResourceKind = (typeof resources.$inferInsert)["kind"]
type SeedSourceKind = (typeof sources.$inferInsert)["kind"]

// a stub topic and everything hanging off it, keyed by stable ids so re-running converges
type SeedTopic = {
	id: string
	owner: string
	name: string
	prompt: string
	tags: string[]
	frequency: "daily" | "weekly"
	visibility: "public" | "private"
	// the topic's sources, then Carl's findings about the resources they surfaced
	sources: { kind: SeedSourceKind; config: Record<string, unknown> }[]
	findings: { resourceKind: SeedResourceKind; title: string; url: string; why: string; score: number }[]
}

// the seeded topics. the two dev-owned ones fill Your topics and the public community ones fill Featured and Popular
// biome-ignore format: keep each finding on one line
function buildSeedTopics(devUserId: string): SeedTopic[] {
	return [
	// Agent infrastructure weekly, dev-owned. it has seven findings to exercise the "+N more" expander
	{
		id: "top_agent_infra",
		owner: devUserId,
		name: "Agent infrastructure weekly",
		prompt: "New tools, patterns, and failure modes in shipping production LLM agents. Bias toward receipts over hype.",
		tags: ["AI & Engineering", "Infrastructure", "Research"],
		frequency: "weekly",
		visibility: "private",
		// the sources this topic pulls from
		sources: [
			{ kind: "rss", config: { url: "https://blog.langchain.dev/rss/" } },
			{ kind: "search", config: { query: "production LLM agent infrastructure" } },
		],
		// the findings Carl kept, each with a resource kind: "read", "watch", or "listen"
		findings: [
			{ resourceKind: "read", title: "A field guide to agent memory backends", url: "https://arxiv.org/abs/2607.01234", why: "Benchmarks four memory stores; append-only wins on recall.", score: 0.94 },
			{ resourceKind: "read", title: "Why your tool-calling loop stalls at step 3", url: "https://interconnects.ai/p/tool-loops", why: "Names the exact failure your retries paper over.", score: 0.91 },
			{ resourceKind: "watch", title: "Building durable agents with Temporal", url: "https://www.youtube.com/watch?v=agent-temporal", why: "The retry/signal model you keep reinventing, done right.", score: 0.88 },
			// these push the topic past the five-row cap so the expander shows
			{ resourceKind: "read", title: "Structured outputs beat function calling for extraction", url: "https://eugeneyan.com/writing/structured", why: "Receipts, not vibes: a 12-point accuracy gap.", score: 0.86 },
			{ resourceKind: "listen", title: "Latent Space: the agent runtime wars", url: "https://latent.space/p/agent-runtimes", why: "Two runtime authors argue; you'll pick a side.", score: 0.83 },
			{ resourceKind: "read", title: "Sandboxing untrusted agent code with microVMs", url: "https://fly.io/blog/sandboxing-agents", why: "E2B vs Firecracker, cost per run tabulated.", score: 0.8 },
			{ resourceKind: "watch", title: "Prompt injection in tool registries", url: "https://www.youtube.com/watch?v=tool-injection", why: "A live demo of the boundary you're building.", score: 0.77 },
		],
	},
	// Literary agents open to queries for adult science fiction, dev-owned
	{
		id: "top_litagents",
		owner: devUserId,
		name: "Literary agents open to queries (adult SF)",
		prompt: "Adult science-fiction literary agents opening to queries. Match against a voice-forward space-opera synopsis.",
		tags: ["Books & Writing"],
		frequency: "weekly",
		visibility: "private",
		// the sources this topic pulls from
		sources: [{ kind: "search", config: { query: "adult science fiction literary agent open to queries MSWL" } }],
		// the findings Carl kept, each with a resource kind: "read", "watch", or "listen"
		findings: [
			{ resourceKind: "read", title: "Agent opens to adult SF for two weeks", url: "https://example-agency.com/blog/open-call", why: "Window closes Aug 1; wants voice-forward space opera.", score: 0.92 },
			{ resourceKind: "read", title: "MSWL roundup: agents wanting weird SF", url: "https://manuscriptwishlist.com/roundup-sf", why: "Six wishlists posted; three fit your synopsis.", score: 0.88 },
			{ resourceKind: "read", title: "Querying data: SF response times in 2026", url: "https://querytracker.net/reports/sf-2026", why: "Median 41 days; two agents reply under a week.", score: 0.82 },
			{ resourceKind: "listen", title: "Query letters that don't sound like everyone's", url: "https://podcasts.example.com/writing/queries", why: "This week: the opening line agents actually finish.", score: 0.79 },
			{ resourceKind: "read", title: "Small presses open to unagented adult SF", url: "https://example-press.com/submissions", why: "Three with real distribution, one pays advances.", score: 0.75 },
		],
	},
	// LLM eval techniques, a public community topic
	{
		id: "top_llm_evals",
		owner: COMMUNITY_USER_ID,
		name: "LLM eval techniques",
		prompt: "Practical evaluation methods for LLM pipelines: rubrics, judges, regression harnesses, and their failure modes.",
		tags: ["AI & Engineering"],
		frequency: "daily",
		visibility: "public",
		// the sources this topic pulls from
		sources: [{ kind: "rss", config: { url: "https://hamel.dev/rss.xml" } }],
		// the findings Carl kept, each with a resource kind: "read", "watch", or "listen"
		findings: [
			{ resourceKind: "read", title: "Your LLM-as-judge is scoring length, not quality", url: "https://hamel.dev/blog/judge-bias", why: "A one-line control that exposes the confound.", score: 0.93 },
			{ resourceKind: "watch", title: "Building a promptfoo regression suite", url: "https://www.youtube.com/watch?v=promptfoo-suite", why: "Thirty cases across two models in ten minutes.", score: 0.87 },
			{ resourceKind: "read", title: "Precision/recall for retrieval, without a labeled set", url: "https://example.com/eval/pr-cheap", why: "RSS-as-ground-truth trick you can copy tonight.", score: 0.84 },
			{ resourceKind: "listen", title: "How Anthropic thinks about evals", url: "https://podcasts.example.com/evals-anthropic", why: "The 'eval-driven development' pitch, unhyped.", score: 0.8 },
			{ resourceKind: "read", title: "Stop averaging your eval scores", url: "https://example.com/eval/no-averages", why: "Distribution beats mean; a worked counterexample.", score: 0.76 },
		],
	},
	// MCP ecosystem watch, a public community topic
	{
		id: "top_mcp_watch",
		owner: COMMUNITY_USER_ID,
		name: "MCP ecosystem watch",
		prompt: "New Model Context Protocol servers, clients, and spec changes. Favor things that ship over proposals.",
		tags: ["AI & Engineering"],
		frequency: "daily",
		visibility: "public",
		// the sources this topic pulls from
		sources: [{ kind: "reddit", config: { subreddit: "mcp" } }],
		// the findings Carl kept, each with a resource kind: "read", "watch", or "listen"
		findings: [
			{ resourceKind: "read", title: "The MCP spec just added streamable HTTP", url: "https://modelcontextprotocol.io/blog/streamable-http", why: "stdio is now the fallback, not the default.", score: 0.9 },
			{ resourceKind: "watch", title: "Connecting Claude to a Postgres MCP server", url: "https://www.youtube.com/watch?v=mcp-postgres", why: "End-to-end in eight minutes, auth included.", score: 0.85 },
			{ resourceKind: "read", title: "A registry of 200 community MCP servers", url: "https://example.com/mcp/registry", why: "Sortable by transport; most are still stdio-only.", score: 0.81 },
			{ resourceKind: "read", title: "Auth patterns for remote MCP", url: "https://example.com/mcp/auth", why: "The OAuth dance, minus the parts that bite.", score: 0.78 },
		],
	},
	// YC batch launches, a public community topic
	{
		id: "top_yc_launches",
		owner: COMMUNITY_USER_ID,
		name: "YC batch launches",
		prompt: "Launches from the current YC batch, weighted toward dev tools and AI infrastructure.",
		tags: ["Startups & Business"],
		frequency: "daily",
		visibility: "public",
		// the sources this topic pulls from
		sources: [{ kind: "search", config: { query: "YC S26 launch dev tools" } }],
		// the findings Carl kept, each with a resource kind: "read", "watch", or "listen"
		findings: [
			{ resourceKind: "read", title: "A batch full of eval startups", url: "https://example.com/yc/eval-startups", why: "Five launched this week; here's the one with users.", score: 0.86 },
			{ resourceKind: "read", title: "The 'MCP for X' wave hits YC", url: "https://example.com/yc/mcp-wave", why: "Three near-duplicates; one has a real wedge.", score: 0.82 },
			{ resourceKind: "watch", title: "Launch demo: agent observability", url: "https://www.youtube.com/watch?v=yc-observability", why: "Traces done well; pricing left the room.", score: 0.78 },
			{ resourceKind: "read", title: "Who's hiring from the batch", url: "https://example.com/yc/hiring", why: "Four teams want infra engineers now.", score: 0.72 },
		],
	},
	// Longevity research, a public community topic graded by evidence strength
	{
		id: "top_longevity",
		owner: COMMUNITY_USER_ID,
		name: "Longevity research, evidence-graded",
		prompt: "Longevity and healthspan research, graded by evidence strength. Down-rank mouse-only and supplement marketing.",
		tags: ["Health & Fitness"],
		frequency: "weekly",
		visibility: "public",
		// the sources this topic pulls from
		sources: [{ kind: "rss", config: { url: "https://example.com/longevity.xml" } }],
		// the findings Carl kept, each with a resource kind: "read", "watch", or "listen"
		findings: [
			{ resourceKind: "read", title: "Zone 2 and mitochondrial density: the human data", url: "https://example.com/longevity/zone2", why: "Actual RCT, not the usual mouse extrapolation.", score: 0.89 },
			{ resourceKind: "listen", title: "Grading the rapamycin evidence", url: "https://podcasts.example.com/longevity/rapamycin", why: "Where the human trials actually stand in 2026.", score: 0.84 },
			{ resourceKind: "read", title: "Sleep regularity beats sleep duration", url: "https://example.com/longevity/sleep-regularity", why: "Large cohort; the effect size is not small.", score: 0.8 },
			{ resourceKind: "read", title: "Most VO2max supplements do nothing", url: "https://example.com/longevity/vo2-supplements", why: "A meta-analysis that will save you money.", score: 0.74 },
		],
	},
	// SUBSCRIBER_COUNTS and FEATURE_ORDER below key off these topic ids
	]
}

// no real subscribers exist before auth, so seed a pool of stub members whose Subscriptions give topics real counts
const MEMBER_COUNT = 48
// how many of the stub members subscribe to each topic. the counts vary to look like a real community and never exceed MEMBER_COUNT
// only public topics appear here. a private topic has no subscribers, which is what gates who may act on its findings
const SUBSCRIBER_COUNTS: Record<string, number> = {
	top_llm_evals: 44,
	top_mcp_watch: 27,
	top_yc_launches: 19,
	top_longevity: 31,
}

// the hard-coded Featured section. it maps topic id to ascending feature order, and topics without an entry are not featured
const FEATURE_ORDER: Record<string, number> = {
	top_llm_evals: 1,
	top_longevity: 2,
	top_mcp_watch: 3,
}

// seeds the dev branch with demo topics, stub members, and subscriptions under the given dev user.
// the dev user already exists — api/seed.ts creates it through a real signup before calling this
export async function seed(devUserId: string): Promise<void> {
	// refuse outside the dev Doppler environment so the seed can never touch staging or production
	if (process.env.DOPPLER_ENVIRONMENT !== "dev") {
		const seen = process.env.DOPPLER_ENVIRONMENT ?? "unset"
		throw new Error(
			`db:seed refuses to run: DOPPLER_ENVIRONMENT is "${seen}", expected "dev" (run via \`doppler run -- bun run db:seed\`)`,
		)
	}
	const seedTopics = buildSeedTopics(devUserId)
	// a pool of stub members that gives topics real subscriber counts
	const memberUsers = Array.from({ length: MEMBER_COUNT }, (_, i) => ({
		id: `usr_member_${i}`,
		name: `Member ${i + 1}`,
		email: `member${i}@carlnotes.dev`,
	}))
	// insert the community owner and every stub member. the dev user already exists, created via a real signup
	await db
		.insert(users)
		.values([{ id: COMMUNITY_USER_ID, name: "CarlNotes Community", email: "community@carlnotes.dev" }, ...memberUsers])
		.onConflictDoNothing()
	// each topic and everything hanging off it
	for (const topic of seedTopics) {
		await seedTopic(topic)
	}
	// subscribe the first N members to each topic so every topic has a real, countable subscriber count
	const subscriptionRows = seedTopics.flatMap((topic) =>
		Array.from({ length: SUBSCRIBER_COUNTS[topic.id] ?? 0 }, (_, i) => ({
			id: `sub_${topic.id}_${i}`,
			topicId: topic.id,
			subscriberUserId: `usr_member_${i}`,
		})),
	)
	// idempotent by stable id. guard the empty case because .values with an empty array throws
	if (subscriptionRows.length > 0) {
		await db.insert(subscriptions).values(subscriptionRows).onConflictDoNothing()
	}
	console.log(`seeded ${seedTopics.length} topics and ${subscriptionRows.length} subscriptions for ${devUserId}`)
}

// insert one topic and its scan, sources, resources, and findings. all of it is idempotent by stable id or unique url
async function seedTopic(topic: SeedTopic): Promise<void> {
	// the topic row
	await db
		.insert(topics)
		.values({
			id: topic.id,
			ownerId: topic.owner,
			name: topic.name,
			prompt: topic.prompt,
			// frequency, visibility, the filter tags, and the hard-coded featured order
			frequency: topic.frequency,
			visibility: topic.visibility,
			tags: topic.tags,
			featureOrder: FEATURE_ORDER[topic.id] ?? null,
		})
		// upsert featureOrder and tags so re-seeding refreshes both on already-seeded rows
		.onConflictDoUpdate({
			target: topics.id,
			set: { featureOrder: FEATURE_ORDER[topic.id] ?? null, tags: topic.tags },
		})
	// one succeeded scan gives the topic a last-scan time and an ai summary
	const scanId = `scan_${topic.id}`
	await db
		.insert(scans)
		.values({
			id: scanId,
			topicId: topic.id,
			status: "succeeded",
			finishedAt: new Date(),
			// the counts are illustrative. Carl read about four times what he kept
			foundCount: topic.findings.length * 4,
			keptCount: topic.findings.length,
			filteredCount: topic.findings.length * 3,
			scanSummary: `Carl read ${topic.findings.length * 4} things and kept ${topic.findings.length}.`,
		})
		.onConflictDoNothing()
	// the topic's sources
	if (topic.sources.length > 0) {
		await db
			.insert(sources)
			.values(
				topic.sources.map((source, i) => ({
					// stable ids keyed by topic and position keep re-seeding idempotent
					id: `src_${topic.id}_${i}`,
					topicId: topic.id,
					kind: source.kind,
					config: source.config,
				})),
			)
			.onConflictDoNothing()
	}
	// each entry becomes a global resource, deduped by url, plus a topic finding that points at it
	for (const [i, finding] of topic.findings.entries()) {
		const resourceId = `res_${topic.id}_${i}`
		// insert the resource, skipping it when the url already exists
		await db
			.insert(resources)
			.values({ id: resourceId, url: finding.url, kind: finding.resourceKind, title: finding.title })
			.onConflictDoNothing()
		// then the finding pointing at it
		await db
			.insert(findings)
			.values({
				id: `find_${topic.id}_${i}`,
				topicId: topic.id,
				resourceId,
				scanId,
				// the score and explanation Carl gave, plus a demo view count derived from the score
				relevanceScore: finding.score,
				relevanceExplanation: finding.why,
				viewCount: Math.round(finding.score * 60),
			})
			// upsert viewCount so re-seeding refreshes the demo counts on already-seeded rows
			.onConflictDoUpdate({ target: findings.id, set: { viewCount: Math.round(finding.score * 60) } })
	}
}
