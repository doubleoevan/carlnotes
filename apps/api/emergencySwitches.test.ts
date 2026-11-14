// the emergency switches: with nothing set every switch reads its off value from an empty database and no Doppler
// value, and each pause is read in one place
import { afterEach, beforeEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { loadSpendControlSettings } from "@carlnotes/db/dailySpendCutoffs"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import {
	isPodcastEpisodeRecordingConfigured,
	podcastEpisodeSpeechModel,
	topicPodcastEpisodeVideoBackfillConcurrency,
	topicPodcastEpisodeVideoConcurrency,
} from "@carlnotes/server/podcastEpisodeSettings"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { scanDispatchLimit } from "@carlnotes/server/scanSettings"
import { listSourceFiles } from "@carlnotes/server/sourceFileTestFixtures"
import { loadCachedMobileMinimumVersions } from "./mobileMinimumVersions"

// every Doppler setting that is a switch or a switch's default
const SWITCH_SETTINGS = [
	"PODCAST_EPISODES_DAILY_SPEND_CUTOFF_USD",
	"SCHEDULED_SCANS_DAILY_SPEND_CUTOFF_USD",
	"CHAT_DAILY_SPEND_CUTOFF_USD",
	"FIRST_SCAN_DISPATCH_LIMIT",
	"SCAN_DISPATCH_LIMIT",
	"PODCAST_SPEECH_MODEL",
	"TOPIC_PODCAST_EPISODE_VIDEO_CONCURRENCY",
	"TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY",
	"TOPIC_PODCAST_EPISODE_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT",
]
const restoreEnvSettings = saveEnvSettings(SWITCH_SETTINGS)

// no Doppler value, an empty in-memory Redis, and a database whose tables hold no row
beforeEach(() => {
	for (const switchSetting of SWITCH_SETTINGS) {
		delete Bun.env[switchSetting]
	}
	stubRedisClient()
	stubConnectionPool()
})

// put the settings and both stores back after the test
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
	restoreEnvSettings()
})

test("nothing set reads every switch as off", async () => {
	// the spend control settings: both pauses, the pinned-only home, and the unverified accounts switch off, the cutoffs
	// at 65, 100, and 150 dollars, 5 waiting scans a sweep, and 40 generated images a film
	expect(await loadSpendControlSettings()).toMatchObject({
		isPodcastEpisodeRecordingPaused: false,
		isTopicPodcastEpisodeVideoRenderingPaused: false,
		isHomePinnedOnly: false,
		isUnverifiedFirstScanLimitOn: false,
		podcastEpisodesCutoffCents: 6500,
		scheduledScansCutoffCents: 10_000,
		chatCutoffCents: 15_000,
		firstScanDispatchLimit: 5,
		generatedChapterImageLimit: 40,
	})

	// the Doppler settings: 100 Scans a sweep, the default speech model, and one film and one backfill film at a time
	expect(scanDispatchLimit()).toBe(100)
	expect(podcastEpisodeSpeechModel()).toBe("gemini-3.8-flash-tts")
	expect(isPodcastEpisodeRecordingConfigured()).toBe(true)
	expect(topicPodcastEpisodeVideoConcurrency()).toBe(1)
	expect(topicPodcastEpisodeVideoBackfillConcurrency()).toBe(1)

	// no mobile minimum version on either platform
	expect(await loadCachedMobileMinimumVersions()).toEqual({ ios: null, android: null })
})

// the folders that every app's and package's source is under
const SOURCE_FOLDERS = ["apps/api", "apps/worker", "apps/web/src", "apps/mobile/app", "apps/mobile/src", "packages"]

// the modules that hold, save, and show the spend control settings: the contracts, the database package, the admin
// console's route module, and the admin console's components
const SPEND_CONTROL_SETTINGS_PATH_PREFIXES = [
	"packages/contracts/",
	"packages/db/",
	"apps/api/spendControlSettings.ts",
	"apps/web/src/components/admin/",
]

// no module that reads a published podcast episode, a feed, or a ready film reads a pause, the film backfill and the
// rebuild do not, and no page outside the admin console shows one
test("each pause is read by the one activity that starts new work", () => {
	// every source file outside the modules that hold, save, and show the spend control settings
	const sourceFiles = listSourceFiles(SOURCE_FOLDERS).filter(
		({ path }) => !SPEND_CONTROL_SETTINGS_PATH_PREFIXES.some((pathPrefix) => path.startsWith(pathPrefix)),
	)
	const toSettingReaderPaths = (settingName: string): string[] =>
		sourceFiles.filter(({ text }) => text.includes(settingName)).map(({ path }) => path)

	// the podcast plan alone reads the pause on new podcast episodes, and the film switch alone the pause on new films
	expect(toSettingReaderPaths("isPodcastEpisodeRecordingPaused")).toEqual([
		"packages/pipeline/podcast/planPodcastEpisode.ts",
	])
	expect(toSettingReaderPaths("isTopicPodcastEpisodeVideoRenderingPaused")).toEqual([
		"apps/worker/workflows/recordPodcastEpisodeActivities.ts",
	])
})
