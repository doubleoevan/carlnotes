import { expect, test } from "bun:test"
import { toPodcastEpisodeFixture } from "@carlnotes/core/lib/podcastEpisodeTestFixtures"
import { createPodcastEpisodeCheckpointStore, toPodcastEpisodeCheckpoint } from "./podcastEpisodeCheckpoint"

test("checkpoints keep only account-owned resume fields and reject corrupt state", async () => {
	const values = new Map<string, string>()
	const storage = {
		getItem: async (key: string) => values.get(key) ?? null,
		setItem: async (key: string, value: string) => {
			values.set(key, value)
		},
		removeItem: async (key: string) => {
			values.delete(key)
		},
	}
	const store = createPodcastEpisodeCheckpointStore({ storage, userId: "user-a" })
	store.save({
		podcastEpisode: toPodcastEpisodeFixture(),
		positionSeconds: 40,
		playbackRate: 1.25,
		isPlaying: true,
		isLoading: false,
		errorMessage: null,
	})
	await Promise.resolve()
	const savedCheckpoint = await store.read()
	expect(savedCheckpoint).toMatchObject({
		podcastEpisodeId: "episode-1",
		positionSeconds: 40,
		playbackRate: 1.25,
		isCompleted: false,
	})
	expect(values.has("carlnotes:podcast:user-a")).toBe(true)
	expect(JSON.stringify(savedCheckpoint)).not.toContain("audioUrl")
	expect(JSON.stringify(savedCheckpoint)).not.toContain("chapters")
	for (const raw of [
		null,
		"broken",
		"{}",
		JSON.stringify({ ...savedCheckpoint, positionSeconds: -1 }),
		JSON.stringify({ ...savedCheckpoint, playbackRate: 7 }),
	]) {
		expect(toPodcastEpisodeCheckpoint(raw)).toBeNull()
	}
	await store.clear()
	expect(values.size).toBe(0)
})

test("retiring an account drains accepted writes before removing its checkpoint", async () => {
	const pending = Promise.withResolvers<void>()
	const values = new Map<string, string>()
	const store = createPodcastEpisodeCheckpointStore({
		userId: "user-a",
		storage: {
			getItem: async (key) => values.get(key) ?? null,
			setItem: async (key, value) => {
				await pending.promise
				values.set(key, value)
			},
			removeItem: async (key) => {
				values.delete(key)
			},
		},
	})
	const state = {
		podcastEpisode: toPodcastEpisodeFixture(),
		positionSeconds: 40,
		playbackRate: 1,
		isPlaying: false,
		isLoading: false,
		errorMessage: null,
	}
	store.save(state)
	await Promise.resolve()
	const clearing = store.clear()
	store.save(state)
	pending.resolve()
	await clearing
	expect(values.size).toBe(0)
	expect(await store.read()).toBeNull()
})

test("forgetting a removed episode preserves a newer selection and permits later saves", async () => {
	const values = new Map<string, string>()
	const store = createPodcastEpisodeCheckpointStore({
		userId: "reader",
		storage: {
			getItem: async (key) => values.get(key) ?? null,
			setItem: async (key, value) => {
				values.set(key, value)
			},
			removeItem: async (key) => {
				values.delete(key)
			},
		},
	})
	const state = {
		podcastEpisode: toPodcastEpisodeFixture(),
		positionSeconds: 20,
		playbackRate: 1.5,
		isPlaying: false,
		isLoading: false,
		errorMessage: null,
	}
	store.save(state)
	store.save({ ...state, podcastEpisode: toPodcastEpisodeFixture({ id: "episode-2" }) })
	await store.forget("episode-1")
	expect((await store.read())?.podcastEpisodeId).toBe("episode-2")
	await store.forget("episode-2")
	expect(await store.read()).toBeNull()
	store.save(state)
	expect((await store.read())?.podcastEpisodeId).toBe("episode-1")
	store.retire()
	store.save({ ...state, positionSeconds: 99 })
	expect(await store.read()).toBeNull()
	expect(JSON.parse(values.get("carlnotes:podcast:reader") ?? "{}").positionSeconds).toBe(20)
})

test("checkpoint cleanup cannot interrupt the remaining successful sign-out cleanup", async () => {
	// a device storage failure must not turn successful server sign-out into a rejected exit
	const store = createPodcastEpisodeCheckpointStore({
		userId: "reader",
		storage: {
			getItem: async () => null,
			setItem: async () => {},
			removeItem: async () => {
				throw new Error("Storage unavailable")
			},
		},
	})
	await expect(store.clear()).resolves.toBeUndefined()
	expect(await store.read()).toBeNull()
})
