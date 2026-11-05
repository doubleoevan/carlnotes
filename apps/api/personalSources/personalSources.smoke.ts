// live personal sources acceptance checks use disposable development accounts and retain review fixtures when requested
import { connectionPool } from "@carlnotes/db"
import { checkPersonalSourcesAiAgentGrants } from "./personalSourcesAiAgentSmoke"
import { checkPersonalSourcesContext } from "./personalSourcesContextSmoke"
import { checkPersonalSourcesEmailPersistence } from "./personalSourcesEmailSmoke"
import { checkPersonalSourcesImports } from "./personalSourcesImportSmoke"
import { checkPersonalSourcesLinkQueue } from "./personalSourcesLinkSmoke"
import { checkPersonalSourcesLiveFlow } from "./personalSourcesLiveSmoke"
import {
	checkPersonalSourcePersistence,
	checkPersonalSourcesEntryPagination,
	checkPersonalSourcesPublicationRace,
	checkPersonalSourcesQuotaPersistence,
	checkPersonalSourcesRetentionPersistence,
} from "./personalSourcesPersistenceSmoke"
import {
	checkPersonalSourcesParentDeletion,
	checkPersonalSourcesReceiptRollback,
	checkPersonalSourcesSchema,
} from "./personalSourcesSchemaSmoke"
import { checkPersonalSourcesScoreBonus } from "./personalSourcesScoreSmoke"
import { checkPersonalSourcesMultiSend } from "./personalSourcesSendSmoke"
import { checkPersonalSourcesSharing } from "./personalSourcesSharingSmoke"
import { cleanUpPersonalSourcesSmoke } from "./personalSourcesSmokeFixtures"

// require the explicitly selected development project before any writes
if (Bun.env.DOPPLER_CONFIG !== "dev") {
	throw new Error("Personal sources smoke requires the development Doppler configuration")
}

// an optional section reruns a changed acceptance path while the default exercises every section
const checks: Record<string, () => Promise<void>> = {
	quota: checkPersonalSourcesQuotaPersistence,
	"multi-send": checkPersonalSourcesMultiSend,
	sources: checkPersonalSourcePersistence,
	retention: checkPersonalSourcesRetentionPersistence,
	pagination: checkPersonalSourcesEntryPagination,
	privacy: checkPersonalSourcesPublicationRace,
	sharing: checkPersonalSourcesSharing,
	schema: checkPersonalSourcesSchema,
	rollback: checkPersonalSourcesReceiptRollback,
	deletion: checkPersonalSourcesParentDeletion,
	aiAgents: checkPersonalSourcesAiAgentGrants,
	imports: checkPersonalSourcesImports,
	context: checkPersonalSourcesContext,
	links: checkPersonalSourcesLinkQueue,
	bonus: checkPersonalSourcesScoreBonus,
	email: checkPersonalSourcesEmailPersistence,
	live: checkPersonalSourcesLiveFlow,
}
const shouldKeepFixtures = Bun.argv.includes("--keep")
const requestedChecks = Bun.argv.slice(2).filter((argument) => argument !== "--keep")
if (requestedChecks.some((name) => !Object.hasOwn(checks, name))) {
	throw new Error("Unknown personal sources smoke section")
}
try {
	for (const name of requestedChecks.length > 0 ? requestedChecks : Object.keys(checks)) {
		await checks[name]?.()
	}
	console.log("Personal sources persistence smoke passed")
} finally {
	await cleanUpPersonalSourcesSmoke(shouldKeepFixtures)
	await connectionPool.end()
}
