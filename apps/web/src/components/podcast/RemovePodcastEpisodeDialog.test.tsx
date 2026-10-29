import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as client from "@carlnotes/client/podcastEpisodeClient"
import {
	type PodcastEpisodeRemovalConfirm,
	RemovePodcastEpisodeDialog,
} from "@carlnotes/core/components/RemovePodcastEpisodeDialog"
import { toPodcastEpisodeFixture } from "@carlnotes/core/lib/podcastEpisodeTestFixtures"
import {
	clearPodcastEpisodePlayer,
	registerPodcastEpisodeAudioAdapter,
	restorePodcastEpisode,
	toLoadedPodcastEpisode,
} from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { act, type ComponentProps } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"

afterEach(() => {
	// retire the test episode before another hook or server render reads the shared store
	clearPodcastEpisodePlayer()
	mock.restore()
})

test("removal requires confirmation, submits once, and unloads only after success", async () => {
	// capture the platform confirmation callbacks while using the actual shared component
	const request = Promise.withResolvers<boolean>()
	const remove = spyOn(client, "sendRemovePodcastEpisode").mockReturnValue(request.promise)
	const close = mock(() => {})
	const refreshed = mock(() => {})
	const forgotten = mock(async () => {})
	let confirmation: ComponentProps<PodcastEpisodeRemovalConfirm> | undefined
	const Confirm: PodcastEpisodeRemovalConfirm = (props) => {
		confirmation = props
		return null
	}
	const unregister = registerPodcastEpisodeAudioAdapter({
		load: () => {},
		play: () => {},
		pause: () => {},
		seek: () => {},
		setPlaybackRate: () => {},
		unload: () => {},
		updateMetadata: () => {},
	})
	restorePodcastEpisode({ podcastEpisode: toPodcastEpisodeFixture(), positionSeconds: 30, playbackRate: 1 })
	const harness = await renderTestHook(
		() => null,
		() => (
			<RemovePodcastEpisodeDialog
				userId="owner"
				podcastEpisode={toPodcastEpisodeFixture()}
				onClose={close}
				onPodcastEpisodeRemoved={refreshed}
				onRemoved={forgotten}
				Confirm={Confirm}
			/>
		),
	)
	try {
		expect(remove).not.toHaveBeenCalled()
		await act(async () => confirmation?.onClose())
		expect(remove).not.toHaveBeenCalled()
		let pending: Promise<void> | undefined
		await act(async () => {
			pending = confirmation?.onConfirm()
			void confirmation?.onConfirm()
		})
		expect(remove).toHaveBeenCalledTimes(1)
		expect(toLoadedPodcastEpisode()?.id).toBe("episode-1")
		await act(async () => {
			request.resolve(true)
			await pending
		})
		expect(toLoadedPodcastEpisode()).toBeNull()
		expect(forgotten).toHaveBeenCalledWith("episode-1")
		expect(refreshed).toHaveBeenCalledTimes(1)
	} finally {
		await harness.close()
		unregister()
	}
})

test("failed removal keeps audio and resume state", async () => {
	// retain loaded audio when the server refuses the removal
	spyOn(client, "sendRemovePodcastEpisode").mockResolvedValue(false)
	const forgotten = mock(async () => {})
	const refreshed = mock(() => {})
	let confirm: (() => Promise<void>) | undefined
	const Confirm: PodcastEpisodeRemovalConfirm = (props) => {
		confirm = props.onConfirm
		return null
	}
	restorePodcastEpisode({ podcastEpisode: toPodcastEpisodeFixture(), positionSeconds: 30, playbackRate: 1 })
	const harness = await renderTestHook(
		() => null,
		() => (
			<RemovePodcastEpisodeDialog
				userId="owner"
				podcastEpisode={toPodcastEpisodeFixture()}
				onClose={() => {}}
				onPodcastEpisodeRemoved={refreshed}
				onRemoved={forgotten}
				Confirm={Confirm}
			/>
		),
	)
	try {
		await act(async () => confirm?.())
		expect(toLoadedPodcastEpisode()?.id).toBe("episode-1")
		expect(forgotten).not.toHaveBeenCalled()
		expect(refreshed).not.toHaveBeenCalled()
	} finally {
		await harness.close()
	}
})

test("retired removal callbacks cannot clear another account or navigate a replacement page", async () => {
	// finish an old account's request after the same dialog switches accounts
	const request = Promise.withResolvers<boolean>()
	const remove = spyOn(client, "sendRemovePodcastEpisode").mockReturnValue(request.promise)
	const refreshed = mock(() => {})
	const forgotten = mock(async () => {})
	const close = mock(() => {})
	let confirm: (() => Promise<void>) | undefined
	const Confirm: PodcastEpisodeRemovalConfirm = (props) => {
		confirm = props.onConfirm
		return null
	}
	const harness = await renderTestHook(
		() => "owner",
		(userId) => (
			<RemovePodcastEpisodeDialog
				userId={userId}
				podcastEpisode={toPodcastEpisodeFixture()}
				onClose={close}
				onPodcastEpisodeRemoved={refreshed}
				onRemoved={forgotten}
				Confirm={Confirm}
			/>
		),
	)
	let pending: Promise<void> | undefined
	await act(async () => {
		pending = confirm?.()
	})
	await harness.render(() => "another-owner")
	await harness.render(() => "owner")
	request.resolve(true)
	await pending
	expect(forgotten).not.toHaveBeenCalled()
	expect(refreshed).not.toHaveBeenCalled()
	expect(close).not.toHaveBeenCalled()

	// a system alert may outlive the component that opened it
	const retiredConfirm = confirm
	await harness.close()
	await retiredConfirm?.()
	expect(remove).toHaveBeenCalledTimes(1)
})

for (const failingCallback of ["checkpoint", "refresh"] as const) {
	test(`successful removal closes when ${failingCallback} cleanup fails`, async () => {
		// keep a completed server removal distinct from a local refresh failure
		spyOn(client, "sendRemovePodcastEpisode").mockResolvedValue(true)
		const close = mock(() => {})
		const fail = async (): Promise<void> => {
			throw new Error("Unavailable")
		}
		let confirm: (() => Promise<void>) | undefined
		const Confirm: PodcastEpisodeRemovalConfirm = (props) => {
			confirm = props.onConfirm
			return null
		}
		const harness = await renderTestHook(
			() => null,
			() => (
				<RemovePodcastEpisodeDialog
					userId="owner"
					podcastEpisode={toPodcastEpisodeFixture()}
					onClose={close}
					onRemoved={failingCallback === "checkpoint" ? fail : undefined}
					onPodcastEpisodeRemoved={failingCallback === "refresh" ? fail : () => {}}
					Confirm={Confirm}
				/>
			),
		)
		try {
			await act(async () => confirm?.())
			expect(close).toHaveBeenCalledTimes(1)
		} finally {
			await harness.close()
		}
	})
}
