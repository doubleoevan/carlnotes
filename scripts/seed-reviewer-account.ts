// entry point for `doppler run --config <dev|prd> -- bun run reviewer:seed -- --environment <dev|prd>`: creates or
// refreshes the store reviewer's account in exactly that environment. the account signs up through the real sign-up
// path, holds one Topic on the site's own blog feed with a finished scan, a Tasting Note, a Team with one chat
// message, and follows one public Topic with a published Podcast Episode. a rerun creates only what is missing
import {
	parseReviewerSeedArguments,
	SCAN_POLL_MS,
	SCAN_WAIT_MS,
	type ScanWaitReading,
	toReviewerEnvironment,
	toReviewerFixtures,
	toScanWaitStatus,
} from "./seedReviewerAccount"

// the environment and the credentials are checked before any import that opens a database connection
const environment = toReviewerEnvironment({
	requestedEnvironment: parseReviewerSeedArguments(Bun.argv.slice(2)).requestedEnvironment,
	dopplerConfig: Bun.env.DOPPLER_CONFIG,
})
console.log(`reviewer:seed runs against ${environment}`)

// the credentials Doppler holds. neither is ever printed
const reviewerEmail = toRequiredEnvValue("REVIEWER_EMAIL")
const reviewerPassword = toRequiredEnvValue("REVIEWER_PASSWORD")

// the api and database modules load only now, after the checks above passed. first the contracts
const { TERMS_VERSION } = await import("@carlnotes/contracts/terms")
const { GATE_COOKIE_NAME, MIN_PASSWORD_LENGTH } = await import("@carlnotes/contracts/signupGate")

// the password is saved below the sign-up form's validation, so its length rule is checked here
if (reviewerPassword.length < MIN_PASSWORD_LENGTH) {
	console.error(`reviewer:seed: REVIEWER_PASSWORD needs at least ${MIN_PASSWORD_LENGTH} characters`)
	process.exit(1)
}
const { toDeviceProperties } = await import("@carlnotes/contracts/userAgent")

// the database and the tables the script reads
const { db, isPublicAndShown } = await import("@carlnotes/db")
const { users } = await import("@carlnotes/db/schema/users")
const { findings, scans } = await import("@carlnotes/db/schema/scans")
const { subscriptions, topics } = await import("@carlnotes/db/schema/topics")
const { notes } = await import("@carlnotes/db/schema/notes")
const { teamMembers, teams } = await import("@carlnotes/db/schema/teams")
const { chatRoomMessages } = await import("@carlnotes/db/schema/chat")
const { podcastEpisodes } = await import("@carlnotes/db/schema/podcast")

// the app url and the analytics flush, imported by path
const { appUrl } = await import("../packages/server/appUrl")
const { shutdownAnalytics } = await import("../packages/server/analytics")

// the query helpers
const { and, count, desc, eq, isNull, ne, sql } = await import("drizzle-orm")

// the api's own sign-up, topic, scan, and subscribe paths
const { auth } = await import("../apps/api/auth")
const { signGateToken } = await import("../apps/api/signupGate")
const { createTopic } = await import("../apps/api/topic/saveTopic")
const { runManualScan } = await import("../apps/api/topic/scans")
const { setTopicSubscription } = await import("../apps/api/topic/subscriptions")

// the api's own note, team, and chat room paths
const { createNote } = await import("../apps/api/note/notePayloads")
const { loadTopicPage } = await import("../apps/api/note/permissions")
const { sanitizeNoteHtml } = await import("../apps/api/note/noteHtml")
const { createTeam } = await import("../apps/api/team/teams")
const { postChatRoomMessage } = await import("../apps/api/chat/room")

// the fixtures, with the Topic's Source at this environment's own blog feed
const fixtures = toReviewerFixtures(`${appUrl()}/feed.xml`)

// the properties the reused api paths report their events with. the script does what the web app's sign-up form does
const analyticsProperties = { entryPoint: "web" as const, plan: "free", ...toDeviceProperties(undefined) }

// the seed, step by step, then the closing summary
const reviewerUserId = await ensureReviewerUser()
const topicId = await ensureTopic(reviewerUserId)
await waitForScan(reviewerUserId, topicId)
await ensureNote(reviewerUserId, topicId)
const teamId = await ensureTeam(reviewerUserId, topicId)
await ensureChatMessage(reviewerUserId, teamId)
const subscribedTopicName = await ensurePodcastSubscription(reviewerUserId)
printSummary({ topicId, teamId, subscribedTopicName })

// flush the events the reused paths tracked, then exit past the connections the api modules hold open
await shutdownAnalytics()
process.exit(0)

/**
 * Returns the reviewer's user id, signing up through the real sign-up path if the account is missing. Every run resets
 * the password, marks the email verified, accepts the Terms, and keeps the free plan and the user role.
 */
async function ensureReviewerUser(): Promise<string> {
	// find the account, or sign it up the way the sign-up form does, behind the gate cookie
	const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, reviewerEmail))
	const userId = existingUser?.id ?? (await signUpReviewer())
	console.log(existingUser ? "reviewer account exists" : "reviewer account created")

	// save the password through Better Auth's internal adapter, the same write apps/api/seed.ts makes
	const authContext = await auth.$context
	await authContext.internalAdapter.updatePassword(userId, await authContext.password.hash(reviewerPassword))

	// the email counts as verified, the Terms as accepted at the published version, and the plan and role stay at the
	// free plan and the user role
	const [userRow] = await db
		.select({ termsAcceptedVersion: users.termsAcceptedVersion })
		.from(users)
		.where(eq(users.id, userId))
	// a Terms acceptance that is already current keeps its date
	const termsAcceptance =
		userRow?.termsAcceptedVersion === TERMS_VERSION
			? {}
			: { termsAcceptedVersion: TERMS_VERSION, termsAcceptedAt: new Date() }
	// save the verified email, the free plan, the user role, and the Terms acceptance
	await db
		.update(users)
		.set({ emailVerified: true, plan: "free", role: "user", ...termsAcceptance })
		.where(eq(users.id, userId))
	return userId
}

// sign the reviewer up with a throwaway password that passes the sign-up length rule. the real password is saved
// right after, through the same write that sign-in checks against
async function signUpReviewer(): Promise<string> {
	// bind a gate cookie the way the sign-up form holds one after a passing check
	const headers = new Headers({ cookie: `${GATE_COOKIE_NAME}=${await signGateToken()}` })
	const signUpEmailResult = await auth.api.signUpEmail({
		body: { email: reviewerEmail, password: crypto.randomUUID(), name: fixtures.displayName },
		headers,
	})
	return signUpEmailResult.user.id
}

/**
 * Returns the id of the reviewer's Topic on the blog feed, creating it through the topic creation path the api uses if
 * it is missing. The create opens the first scan itself.
 */
async function ensureTopic(userId: string): Promise<string> {
	// an existing Topic by name is kept as it is
	const [existingTopic] = await db
		.select({ id: topics.id })
		.from(topics)
		.where(and(eq(topics.ownerId, userId), eq(topics.name, fixtures.topic.name)))
	if (existingTopic) {
		console.log("topic exists")
		return existingTopic.id
	}

	// the create payload: a private weekly Topic with one rss Source and the editor's defaults. the podcast is left
	// at the editor's default, which is on
	const createTopicResult = await createTopic(
		userId,
		{
			name: fixtures.topic.name,
			prompt: fixtures.topic.prompt,
			tags: [],
			frequency: "weekly",
			scheduledTime: "09:00",
			scheduledDayOfWeek: "wednesday",
			visibility: "private",
			maxTopicFindings: 10,
			inviteEmails: [],
			sources: [{ sourceKind: "rss", config: { url: fixtures.topic.feedUrl } }],
			isPodcastEnabled: undefined,
		},
		analyticsProperties,
	)
	// throw if the Topic was not created
	if (createTopicResult.status !== "created") {
		throw new Error(`the topic could not be created: ${createTopicResult.status}`)
	}
	console.log("topic created, first scan started")
	return createTopicResult.id
}

/**
 * Waits until the Topic's latest scan has finished with Findings and a recap, starting a manual scan first if the
 * Topic has neither and no scan is running. Throws if the scan fails or the wait runs out.
 */
async function waitForScan(userId: string, topicId: string): Promise<void> {
	// a Topic that already has its findings and recap needs no scan
	const firstReading = await loadLatestScanReading(topicId)
	if (toScanWaitStatus(firstReading) === "ready") {
		console.log(`scan done, ${firstReading?.findingCount} findings`)
		return
	}

	// start a manual scan through the topic page's own path, unless one is already running
	if (firstReading?.status !== "running") {
		const manualScanResult = await runManualScan(userId, topicId, analyticsProperties)
		if (manualScanResult.status !== "started" && manualScanResult.status !== "running") {
			throw new Error(`the scan could not start: ${manualScanResult.status}`)
		}
		console.log("scan started")
	}

	// poll the scans table until the scan is ready, failed, or the wait runs out
	const waitEndsAt = Date.now() + SCAN_WAIT_MS
	while (Date.now() < waitEndsAt) {
		// wait, then read the scan and log its status
		await Bun.sleep(SCAN_POLL_MS)
		const reading = await loadLatestScanReading(topicId)
		const waitStatus = toScanWaitStatus(reading)
		console.log(`scan ${reading?.status ?? "pending"}, ${reading?.findingCount ?? 0} findings`)

		// done, or failed for good
		if (waitStatus === "ready") {
			return
		}
		if (waitStatus === "failed") {
			throw new Error(`the scan failed: ${reading?.error ?? "no reason recorded"}`)
		}
	}

	// the wait ran out
	throw new Error(`the scan did not finish within ${SCAN_WAIT_MS / 60000} minutes`)
}

// the Topic's latest scan and its finding count, or undefined before any scan row exists
async function loadLatestScanReading(topicId: string): Promise<ScanWaitReading | undefined> {
	// the latest scan row
	const [latestScan] = await db
		.select({ status: scans.status, error: scans.error, scanSummary: scans.scanSummary })
		.from(scans)
		.where(eq(scans.topicId, topicId))
		.orderBy(desc(scans.startedAt))
		.limit(1)
	// no scan row yet
	if (!latestScan) {
		return undefined
	}

	// the Topic's finding count
	const [findingCountRow] = await db
		.select({ findingCount: count() })
		.from(findings)
		.where(eq(findings.topicId, topicId))
	return { ...latestScan, findingCount: findingCountRow?.findingCount ?? 0 }
}

/**
 * Creates the reviewer's Tasting Note on the Topic through the note creation path if it is missing. The body save
 * lives inside the note route, so the body is written straight to the row.
 */
async function ensureNote(userId: string, topicId: string): Promise<void> {
	// an existing note by name is kept as it is
	const [existingNote] = await db
		.select({ id: notes.id })
		.from(notes)
		.where(and(eq(notes.topicId, topicId), eq(notes.ownerUserId, userId), eq(notes.name, fixtures.note.name)))
	if (existingNote) {
		console.log("note exists")
		return
	}

	// create the note on the topic page, then write its body as the first edit
	const topicPage = await loadTopicPage(topicId)
	const createdNote = topicPage && (await createNote(userId, topicPage, fixtures.note.name, "private"))
	if (!createdNote) {
		throw new Error("the note could not be created")
	}
	// the body, sanitized the way the body save sanitizes it
	await db
		.update(notes)
		.set({ html: sanitizeNoteHtml(fixtures.note.html), version: sql`${notes.version} + 1`, bodyEditedAt: new Date() })
		.where(eq(notes.id, createdNote.id))
	console.log("note created")
}

/**
 * Returns the id of the Team the reviewer leads, creating it through the team creation path with the Topic attached
 * if it is missing. The team's chat room exists with the team row.
 */
async function ensureTeam(userId: string, topicId: string): Promise<string> {
	// an existing Team the reviewer leads by name is kept as it is
	const [existingTeam] = await db
		.select({ id: teams.id })
		.from(teams)
		.innerJoin(teamMembers, eq(teamMembers.teamId, teams.id))
		.where(
			and(
				eq(teamMembers.userId, userId),
				eq(teamMembers.role, "leader"),
				eq(teamMembers.isActive, true),
				eq(teams.name, fixtures.team.name),
			),
		)
	if (existingTeam) {
		console.log("team exists")
		return existingTeam.id
	}

	// create the team with the Topic attached
	const createTeamResult = await createTeam(userId, { name: fixtures.team.name, topicIds: [topicId] })
	if (createTeamResult.status !== "created") {
		throw new Error(`the team could not be created: ${createTeamResult.status}`)
	}
	console.log("team created")
	return createTeamResult.teamId
}

/**
 * Posts the reviewer's first message in the Team room through the chat room post path, unless they posted one already.
 */
async function ensureChatMessage(userId: string, teamId: string): Promise<void> {
	// a message the reviewer already posted in the team room counts
	const [existingMessage] = await db
		.select({ id: chatRoomMessages.id })
		.from(chatRoomMessages)
		.where(
			and(
				eq(chatRoomMessages.teamId, teamId),
				isNull(chatRoomMessages.topicId),
				eq(chatRoomMessages.authorUserId, userId),
			),
		)
		.limit(1)
	if (existingMessage) {
		console.log("team room message exists")
		return
	}

	// post the message. it names nobody, so carl takes no turn
	const postChatRoomMessageResult = await postChatRoomMessage(userId, null, teamId, fixtures.chatMessage, null, [])

	// no result, a rejection name, or a rejection reason all mean the post failed
	if (
		!postChatRoomMessageResult ||
		typeof postChatRoomMessageResult === "string" ||
		postChatRoomMessageResult.rejectionReason
	) {
		throw new Error("the team room message could not be posted")
	}

	console.log("team room message posted")
}

/**
 * Returns the name of the public Topic the reviewer follows for its published Podcast Episode, following the newest
 * one through the subscribe path if they follow none. Returns null on a database with no such Topic.
 */
async function ensurePodcastSubscription(userId: string): Promise<string | null> {
	// the public Topic with the newest published Podcast Episode, owned by somebody else
	const [podcastTopic] = await db
		.select({ id: topics.id, name: topics.name })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(and(eq(podcastEpisodes.status, "published"), isPublicAndShown, ne(topics.ownerId, userId)))
		.orderBy(desc(podcastEpisodes.publishedAt))
		.limit(1)
	// a fresh database may have none
	if (!podcastTopic) {
		console.log("no public topic has a published podcast episode, nothing followed")
		return null
	}

	// an active follow of that Topic is kept as it is
	const [existingSubscription] = await db
		.select({ id: subscriptions.id })
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.topicId, podcastTopic.id),
				eq(subscriptions.subscriberUserId, userId),
				eq(subscriptions.isActive, true),
			),
		)
	if (existingSubscription) {
		console.log("podcast topic followed")
		return podcastTopic.name
	}

	// follow it through the topic page's subscribe path
	const isSubscribed = await setTopicSubscription({
		userId,
		topicId: podcastTopic.id,
		isSubscribed: true,
		analyticsProperties,
	})
	if (!isSubscribed) {
		throw new Error("the podcast topic could not be followed")
	}
	console.log("podcast topic followed")
	return podcastTopic.name
}

// an environment value, or an error naming the variable without its value
function toRequiredEnvValue(name: string): string {
	const value = Bun.env[name]
	if (!value) {
		throw new Error(`reviewer:seed will not run: ${name} is not set`)
	}
	return value
}

// what the summary names: the Topic, the Team, and the subscribed Topic, null when none was found
type PrintSummaryOptions = {
	topicId: string
	teamId: string
	subscribedTopicName: string | null
}

// print what the reviewer's account holds now
function printSummary({ topicId, teamId, subscribedTopicName }: PrintSummaryOptions): void {
	// the subscribed Topic's line
	const subscribedLine = subscribedTopicName ? `follows "${subscribedTopicName}"` : "follows no podcast topic yet"

	// the account, each fixture, and the subscribed Topic
	const summaryLines = [
		`reviewer account ready in ${environment}:`,
		`topic "${fixtures.topic.name}" (${topicId}) scanned, with findings and a recap`,
		`note "${fixtures.note.name}" on the topic`,
		`team "${fixtures.team.name}" (${teamId}) with one message in its room`,
		subscribedLine,
	]
	console.log(summaryLines.join("\n  "))
}
