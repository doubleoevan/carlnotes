import { expect, test } from "bun:test"
import {
	toTestTopicFeed,
	toTestTopicFeedResponse,
	toTestTopicResponse,
} from "@carlnotes/contracts/topicFeedTestFixtures"
import {
	persistQueryClientRestore,
	persistQueryClientSave,
	persistQueryClientSubscribe,
} from "@tanstack/react-query-persist-client"
import { activateQueryCache, createQueryCache, type QueryCache, type QueryCacheStorage } from "./queryCache"
import { toQueryCacheBuster, toQueryCacheKey } from "./queryCacheRules"
import { exitSession, retireSession } from "./sessionExit"

// save and restore through the installed persister, using storage without native imports
test("restores confirmed Home and only the latest visible Topic, excluding mutations and other identities", async () => {
	// seed the allowed queries alongside data that must never reach storage
	const storage = toMemoryStorage()
	const cache = createQueryCache({ storage, userId: "alice", buster: "build-1" })
	cache.client.setQueryData(["topic-feed", "alice"], toTestTopicFeedResponse())
	cache.client.setQueryData(["topic-feed", "bob"], toTestTopicFeedResponse())
	cache.client.setQueryData(["auth", "alice"], { token: "test-only" })
	cache.client.setQueryData(["topic-page", "alice", "old"], {
		status: "visible",
		topic: toTestTopicResponse({ id: "old" }),
	})
	cache.client.setQueryData(["topic-page", "alice", "latest"], {
		status: "visible",
		topic: toTestTopicResponse({ id: "latest" }),
	})
	cache.client.getMutationCache().build(cache.client, { mutationKey: ["topic-finding", "alice"] })
	await save(cache)

	// hydrate into a fresh lifetime without replaying any mutation
	const restoredCache = createQueryCache({ storage, userId: "alice", buster: "build-1" })
	await restore(restoredCache)
	expect(
		restoredCache.client
			.getQueryCache()
			.getAll()
			.map((query) => query.queryKey),
	).toEqual([
		["topic-feed", "alice"],
		["topic-page", "alice", "latest"],
	])
	expect(restoredCache.client.getMutationCache().getAll()).toHaveLength(0)
	expect(cache.client.getQueryData(["topic-page", "alice", "old"])).toBeUndefined()
})

test("a failed refresh retains the last confirmed snapshot, while a gate removes the Topic", async () => {
	// persist a successful read before the next read fails
	const storage = toMemoryStorage()
	const cache = createQueryCache({ storage, userId: "alice", buster: "build-1" })
	const feed = toTestTopicFeedResponse()
	cache.client.setQueryData(["topic-feed", "alice"], feed)
	cache.client.setQueryData(["topic-page", "alice", "topic-1"], { status: "visible", topic: toTestTopicResponse() })
	await save(cache)
	await cache.client
		.fetchQuery({
			queryKey: ["topic-feed", "alice"],
			queryFn: () => Promise.reject(new Error("offline")),
			retry: false,
		})
		.catch(() => undefined)
	cache.client.setQueryData(["topic-page", "alice", "topic-1"], { status: "gated", topicGate: { topicName: "Coffee" } })
	await save(cache)

	// restore successful data, never an error or a formerly accessible topic
	const restoredCache = createQueryCache({ storage, userId: "alice", buster: "build-1" })
	await restore(restoredCache)
	expect(restoredCache.client.getQueryData(["topic-feed", "alice"])).toEqual(toTestTopicFeedResponse([]))
	expect(restoredCache.client.getQueryState(["topic-feed", "alice"])?.status).toBe("success")
	expect(restoredCache.client.getQueryData(["topic-page", "alice", "topic-1"])).toBeUndefined()
})

test("a buster change and corrupt storage discard old data", async () => {
	// persist one build and attempt a restore under another
	const storage = toMemoryStorage()
	const cache = createQueryCache({ storage, userId: "alice", buster: "old" })
	cache.client.setQueryData(["topic-feed", "alice"], toTestTopicFeedResponse())
	await save(cache)
	const restoredCache = createQueryCache({ storage, userId: "alice", buster: "new" })
	await restore(restoredCache)
	expect(restoredCache.client.getQueryCache().getAll()).toHaveLength(0)
	expect(await storage.getItem(toQueryCacheKey("alice"))).toBeNull()

	// malformed JSON also leaves an empty, usable cache
	await storage.setItem(toQueryCacheKey("alice"), "not json")
	await restore(restoredCache)
	expect(await storage.getItem(toQueryCacheKey("alice"))).toBeNull()
})

test("each binary and update identity changes the buster", () => {
	// vary each field independently, including an embedded update
	const build = { appVersion: "1", nativeBuildVersion: "1", runtimeVersion: "1", updateId: "1" }
	const busters = Object.keys(build).map((key) => toQueryCacheBuster({ ...build, [key]: "2" }))
	expect(new Set([toQueryCacheBuster(build), toQueryCacheBuster({ ...build, updateId: null }), ...busters]).size).toBe(
		6,
	)
	expect(toQueryCacheKey("alice")).not.toBe(toQueryCacheKey("bob"))
})

test("cleanup drains a delayed save and blocks late reads and writes", async () => {
	// hold a storage write until cleanup has deactivated the lifetime
	const memory = toMemoryStorage()
	const writeStarted = Promise.withResolvers<void>()
	const releaseWrite = Promise.withResolvers<void>()
	const storage: QueryCacheStorage = {
		...memory,
		setItem: async (key, snapshot) => {
			writeStarted.resolve()
			await releaseWrite.promise
			await memory.setItem(key, snapshot)
		},
	}
	const cache = createQueryCache({ storage, userId: "alice", buster: "build-1" })
	cache.client.setQueryData(["topic-feed", "alice"], toTestTopicFeedResponse())
	const saving = save(cache)
	await writeStarted.promise
	const response = Promise.withResolvers<unknown>()
	const fetching = cache.client
		.fetchQuery({ queryKey: ["topic-page", "alice", "late"], queryFn: () => response.promise })
		.catch(() => undefined)
	const clearing = cache.clear()
	releaseWrite.resolve()
	await Promise.all([saving, clearing])
	response.resolve({ status: "visible", topic: toTestTopicResponse() })
	await fetching
	await save(cache)
	expect(await memory.getItem(toQueryCacheKey("alice"))).toBeNull()
	expect(cache.client.getQueryCache().getAll()).toHaveLength(0)
})

test("failed sign out retains data and a retired session clears it before another request", async () => {
	// a rejected exit retains a usable lifetime
	const storage = toMemoryStorage()
	const cache = createQueryCache({ storage, userId: "alice", buster: "build-1" })
	activateQueryCache(cache)
	cache.client.setQueryData(["topic-feed", "alice"], toTestTopicFeedResponse())
	await save(cache)
	await exitSession(async () => ({ error: { message: "offline" } }))
	expect(cache.client.getQueryData(["topic-feed", "alice"])).toBeDefined()

	// revocation or a successful deletion retires the session before sign out
	await retireSession("deleted-session")
	expect(cache.client.getQueryCache().getAll()).toHaveLength(0)
	expect(await storage.getItem(toQueryCacheKey("alice"))).toBeNull()
})

test("a late response from an earlier Topic never replaces the focused Topic in storage", async () => {
	// navigate to the second page while the first page is still loading
	const storage = toMemoryStorage()
	const cache = createQueryCache({ storage, userId: "alice", buster: "build-1" })
	cache.selectTopic("second")
	cache.client.setQueryData(["topic-page", "alice", "second"], {
		status: "visible",
		topic: toTestTopicResponse({ id: "second" }),
	})
	cache.client.setQueryData(["topic-page", "alice", "first"], {
		status: "visible",
		topic: toTestTopicResponse({ id: "first" }),
	})
	await save(cache)
	const restoredCache = createQueryCache({ storage, userId: "alice", buster: "build-1" })
	await restore(restoredCache)
	expect(
		restoredCache.client
			.getQueryCache()
			.getAll()
			.map((query) => query.queryKey),
	).toEqual([["topic-page", "alice", "second"]])
})

test("an old sign-out completion never clears a new account", async () => {
	// start an exit before the authenticated account changes
	const storage = toMemoryStorage()
	const alice = createQueryCache({ storage, userId: "alice", buster: "build-1" })
	activateQueryCache(alice)
	const signOut = Promise.withResolvers<{ error: null }>()
	const exiting = exitSession(() => signOut.promise)
	const bob = createQueryCache({ storage, userId: "bob", buster: "build-1" })
	activateQueryCache(bob)
	bob.client.setQueryData(["topic-feed", "bob"], toTestTopicFeedResponse())
	await save(bob)
	signOut.resolve({ error: null })
	await exiting
	expect(bob.client.getQueryData(["topic-feed", "bob"])).toBeDefined()
	expect(await storage.getItem(toQueryCacheKey("bob"))).not.toBeNull()
	await bob.clear()
})

test("denied Topic access removes every retained copy and cancels an older feed read", async () => {
	// keep another Topic and another account while revoking the first Topic
	const storage = toMemoryStorage()
	const cache = createQueryCache({ storage, userId: "alice", buster: "build-1" })
	const allowed = toTestTopicFeed({ id: "allowed" })
	const feed = toTestTopicFeedResponse([toTestTopicFeed(), allowed])
	cache.client.setQueryData(["topic-feed", "alice"], feed)
	cache.client.setQueryData(["topic-feed", "bob"], feed)
	cache.client.setQueryData(["site-search", "alice", "coffee"], {
		pages: [
			{
				rows: [
					{ kind: "topic", topic: { id: "topic-1" } },
					{ kind: "team", id: "team-1" },
				],
			},
		],
		pageParams: [1],
	})
	await save(cache)
	const response = Promise.withResolvers<typeof feed>()
	const reading = cache.client
		.fetchQuery({
			queryKey: ["topic-feed", "alice"],
			queryFn: () => response.promise,
		})
		.catch(() => undefined)
	cache.client.setQueryData(["topic-page", "alice", "topic-1"], { status: "missing" })
	response.resolve(feed)
	await reading
	await save(cache)

	// neither a late response nor persistence can expose the denied Topic again
	expect(cache.client.getQueryData(["topic-feed", "alice"])).toEqual(toTestTopicFeedResponse([allowed]))
	expect(cache.client.getQueryData(["topic-feed", "bob"])).toEqual(feed)
	expect(cache.client.getQueryData(["site-search", "alice", "coffee"])).toMatchObject({
		pages: [{ rows: [{ kind: "team", id: "team-1" }] }],
	})
	const restored = createQueryCache({ storage, userId: "alice", buster: "build-1" })
	await restore(restored)
	expect(restored.client.getQueryData(["topic-feed", "alice"])).toEqual(toTestTopicFeedResponse([allowed]))
	await cache.clear()
	await restored.clear()
})

test("transient queries do not rewrite unchanged persisted reading data", async () => {
	// count real storage writes through the installed persistence subscription
	const memory = toMemoryStorage()
	let writes = 0
	const storage: QueryCacheStorage = {
		...memory,
		setItem: async (key, value) => {
			writes += 1
			await memory.setItem(key, value)
		},
	}
	const cache = createQueryCache({ storage, userId: "alice", buster: "build-1" })
	cache.client.setQueryData(["topic-feed", "alice"], toTestTopicFeedResponse())
	await save(cache)
	const stop = persistQueryClientSubscribe({ queryClient: cache.client, ...cache.persistOptions })
	for (let index = 0; index < 5; index += 1) {
		await cache.client.fetchQuery({ queryKey: ["site-search", "alice", index], queryFn: async () => ({ pages: [] }) })
	}
	await new Promise((resolve) => setTimeout(resolve, 20))
	expect(writes).toBe(1)

	// confirmed content changes still reach disk
	cache.client.setQueryData(["topic-feed", "alice"], toTestTopicFeedResponse([]))
	await new Promise((resolve) => setTimeout(resolve, 20))
	expect(writes).toBe(2)
	stop()
	await cache.clear()
})

test("retries an unchanged snapshot after a failed storage write", async () => {
	// fail the first write without changing the valid reading data
	const memory = toMemoryStorage()
	let attempts = 0
	const storage: QueryCacheStorage = {
		...memory,
		setItem: async (key, value) => {
			attempts += 1
			if (attempts === 1) {
				throw new Error("storage temporarily unavailable")
			}
			await memory.setItem(key, value)
		},
	}
	const cache = createQueryCache({ storage, userId: "alice", buster: "build-1" })
	cache.client.setQueryData(["topic-feed", "alice"], toTestTopicFeedResponse())
	await save(cache)
	expect(await memory.getItem(toQueryCacheKey("alice"))).toBeNull()
	await save(cache)
	expect(attempts).toBe(2)
	expect(await memory.getItem(toQueryCacheKey("alice"))).not.toBeNull()
	await cache.clear()
})

// persist with the same allowlist and buster that the provider uses
async function save(cache: QueryCache): Promise<void> {
	await persistQueryClientSave({ queryClient: cache.client, ...cache.persistOptions })
}
async function restore(cache: QueryCache): Promise<void> {
	await persistQueryClientRestore({ queryClient: cache.client, ...cache.persistOptions })
}
function toMemoryStorage(): QueryCacheStorage {
	const snapshots = new Map<string, string>()
	return {
		getItem: async (key) => snapshots.get(key) ?? null,
		setItem: async (key, snapshot) => {
			snapshots.set(key, snapshot)
		},
		removeItem: async (key) => {
			snapshots.delete(key)
		},
	}
}
