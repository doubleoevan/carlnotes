// labeled ranking cases for Personal sources Topic matching. the Topics and the sent content are made up for this eval

// a long attachment far from its Topic's name and prompt, at the matcher's character limit
const ARCHITECTURE_ATTACHMENT = Array.from(
	{ length: 24 },
	(_, sectionIndex) =>
		`Architecture section ${sectionIndex + 1}: CarlNotes runs Bun workspaces with four apps over private packages. The Hono api serves routes and authorization, the Temporal worker runs Scans, Drizzle owns the Postgres schema and migrations, and the Expo mobile app shares the universal packages with the TanStack Start web app. The module map in AGENTS.md lists every package and its import order.`,
).join("\n")

// long attachments on a subject far from their Topic's name and prompt
const KUBERNETES_ATTACHMENT = Array.from(
	{ length: 14 },
	(_, sectionIndex) =>
		`Runbook section ${sectionIndex + 1}: drain the node with kubectl, cordon it, watch the pod disruption budget, roll the deployment, check the ingress controller and the horizontal pod autoscaler, and verify the persistent volume claims reattach after the rolling restart of the Kubernetes cluster.`,
).join("\n")
const MEAL_PLAN_ATTACHMENT = Array.from(
	{ length: 12 },
	(_, weekIndex) =>
		`Week ${weekIndex + 1} meal plan: batch cook lentil dal, roast root vegetables, prep overnight oats, and portion chicken thighs with rice for the training block.`,
).join("\n")
const CODING_AGENT_ATTACHMENT = Array.from(
	{ length: 16 },
	(_, sessionIndex) =>
		`Workshop session ${sessionIndex + 1}: pair with Claude Code and Cursor on a real repository, write a CLAUDE.md, split work across subagents, and review what the coding agent changed before merging its pull request.`,
).join("\n")

export type TopicMatchingTopic = { id: string; name: string; prompt: string; context: string }

// sent content with the Topics that may rank first, none if no Topic relates to it, and the Topics that must rank below
export type TopicMatchingCase = { label: string; content: string; expectedTopicIds: string[]; decoyTopicIds?: string[] }

export const TOPIC_MATCHING_TOPICS: TopicMatchingTopic[] = [
	{
		id: "nachonacho",
		name: "How do I use NachoNacho",
		prompt:
			"Find guides and tips on using NachoNacho to get discounts on SaaS subscriptions and manage software spend.",
		context: ARCHITECTURE_ATTACHMENT,
	},
	{
		id: "documentation",
		name: "CarlNotes Documentation",
		prompt:
			"New practices for documenting the CarlNotes app: architecture guides, agent instructions, and developer docs.",
		context: "",
	},
	{
		id: "marathon",
		name: "Marathon training",
		prompt: "Training plans, pacing, and recovery research for a first marathon.",
		context: KUBERNETES_ATTACHMENT,
	},
	{
		id: "kubernetes",
		name: "Kubernetes operations",
		prompt: "Operating Kubernetes clusters in production: upgrades, autoscaling, and reliability.",
		context: "",
	},
	{
		id: "espresso",
		name: "Home espresso",
		prompt: "Better espresso at home.",
		context:
			"My setup: a Linea Micra with a Niche Zero grinder. I am dialing in light roasts, tuning pressure profiles, puck preparation, water hardness, and pre-infusion for Ethiopian natural beans.",
	},
	{
		id: "atlas",
		name: "Project Atlas",
		prompt: "Keep me up to date on this project.",
		context:
			"Project Atlas is our migration of the billing system from Stripe Invoicing to a usage-based metering pipeline, with entitlement checks, proration rules, and revenue recognition reports for finance.",
	},
	{
		id: "competitors",
		name: "Competitor watch",
		prompt: "Track what our competitors ship.",
		context:
			"Competitors to track: Feedly, Readwise Reader, Inoreader, and Perplexity Pages. Watch their pricing changes, AI summary features, and team plans.",
	},
	{
		id: "nutrition",
		name: "Endurance nutrition",
		prompt: "Fueling and nutrition for endurance athletes.",
		context: MEAL_PLAN_ATTACHMENT,
	},
	{
		id: "codingAgents",
		name: "AI coding agents",
		prompt: "News and techniques for AI coding agents such as Claude Code, Cursor, and Codex.",
		context: "",
	},
	{
		id: "offsite",
		name: "Team offsite planning",
		prompt: "Venues, schedules, and activities for our spring team offsite.",
		context: CODING_AGENT_ATTACHMENT,
	},
	{
		id: "skincare",
		name: "Skincare research",
		prompt: "Evidence on sunscreen filters and retinoids.",
		context: "",
	},
	{
		id: "relocation",
		name: "Moving abroad",
		prompt: "My move.",
		context:
			"I am relocating from Toronto to Lisbon in June. I need the D8 digital nomad visa, a NIF tax number, a Portuguese bank account, and a rental contract before the school year starts.",
	},
]

export const TOPIC_MATCHING_CASES: TopicMatchingCase[] = [
	{
		label: "observed: CarlNotes development chat",
		content:
			"Working on CarlNotes: we discussed the module map in AGENTS.md, Bun workspaces, the Hono api, Temporal workers, Drizzle migrations, and how the mobile app shares packages with web.",
		expectedTopicIds: ["documentation"],
		decoyTopicIds: ["nachonacho"],
	},
	{
		label: "CarlNotes docs chat",
		content:
			"How should we keep the CarlNotes AGENTS.md and developer docs accurate as the repo structure changes? Ideas for the docs site and agent guides.",
		expectedTopicIds: ["documentation"],
		decoyTopicIds: ["nachonacho"],
	},
	{
		label: "own purpose under a long attachment: NachoNacho",
		content:
			"Comparing SaaS discount marketplaces: how NachoNacho credits work, what perks it offers on software subscriptions, and how to stack deals.",
		expectedTopicIds: ["nachonacho"],
	},
	{
		label: "unrelated long attachment: Kubernetes chat",
		content:
			"We hit a problem during a Kubernetes node upgrade: pods stuck terminating and the pod disruption budget blocked the drain. How do we roll the cluster safely?",
		expectedTopicIds: ["kubernetes"],
		decoyTopicIds: ["marathon"],
	},
	{
		label: "unrelated long attachment: coding agent workshop",
		content:
			"Writing a better CLAUDE.md for Claude Code, splitting work across subagents, and reviewing what a coding agent changed before merging.",
		expectedTopicIds: ["codingAgents"],
		decoyTopicIds: ["offsite"],
	},
	{
		label: "short title: Kubernetes release",
		content: "Kubernetes 1.34 upgrade notes for production clusters",
		expectedTopicIds: ["kubernetes"],
		decoyTopicIds: ["marathon"],
	},
	{
		label: "own purpose under a long attachment: marathon",
		content:
			"Long run pacing for a first marathon, tapering in the last three weeks, and how to avoid hitting the wall.",
		expectedTopicIds: ["marathon"],
	},
	{
		label: "own purpose under a long attachment: fueling",
		content: "How many grams of carbs per hour should I take on long rides, and which gels are easiest on the stomach?",
		expectedTopicIds: ["nutrition"],
	},
	{
		label: "own purpose under a long attachment: offsite",
		content: "Comparing venues for a spring team offsite in Portugal, with a schedule and some group activities.",
		expectedTopicIds: ["offsite"],
	},
	{
		label: "own purpose with no attachment: coding agents newsletter",
		content:
			"This week in AI coding agents: Cursor's new background agents, Codex in the terminal, and how teams review generated pull requests. Unsubscribe at the bottom of this email.",
		expectedTopicIds: ["codingAgents"],
	},
	{
		label: "own purpose with no attachment: sunscreen",
		content: "New study on mineral and chemical sunscreen filters, and how to layer a retinoid with SPF at night.",
		expectedTopicIds: ["skincare"],
	},
	{
		label: "attachment clarifies: espresso gear",
		content:
			"Dialing in a light roast Ethiopian natural on a Linea Micra: pre-infusion time, pressure profile, and grind on a Niche Zero.",
		expectedTopicIds: ["espresso"],
	},
	{
		label: "attachment clarifies: vague project",
		content:
			"We need to design proration rules for usage-based metering and the entitlement checks before we move off Stripe Invoicing.",
		expectedTopicIds: ["atlas"],
	},
	{
		label: "attachment clarifies: competitor names",
		content:
			"Readwise Reader changed its pricing and shipped AI summaries for team plans. Inoreader announced something similar.",
		expectedTopicIds: ["competitors"],
	},
	{
		label: "attachment clarifies: a move with a two-word prompt",
		content:
			"What do I need for the D8 visa, how long does a NIF take, and can I open a Portuguese bank account before I arrive in Lisbon?",
		expectedTopicIds: ["relocation"],
	},
	{
		label: "no match: gardening",
		content: "Which tomato varieties grow best in raised beds and when should I transplant seedlings in zone 7?",
		expectedTopicIds: [],
	},
	{
		label: "no match: taxes",
		content:
			"How do I file quarterly estimated taxes as a sole proprietor and which deductions apply to a home office?",
		expectedTopicIds: [],
	},
	{
		label: "no match: sourdough, near espresso",
		content:
			"My sourdough starter smells of acetone and the loaf comes out dense. How should I change the feeding ratio?",
		expectedTopicIds: [],
	},
	{
		label: "no match: guitar pedals",
		content: "What order should a compressor, overdrive, delay, and reverb sit in on a guitar pedalboard?",
		expectedTopicIds: [],
	},
	{
		label: "no match: bird identification",
		content: "A small brown bird with a white eyebrow keeps visiting the feeder. Is it a wren or a sparrow?",
		expectedTopicIds: [],
	},
]
