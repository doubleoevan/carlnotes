// the unchecked images table: an uploaded image whose image moderation could not run, which the sweep checks again
import { sql } from "drizzle-orm"
import { boolean, check, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { primaryId, uncheckedImageSubjectKind } from "./columns"
import { users } from "./users"

// one image waiting for its check. a public-bound image is kept for its uploader alone until the check passes, and a
// private Topic's image is already its subject's current one
export const uncheckedImages = pgTable(
	"unchecked_images",
	{
		id: primaryId(),
		// what the image is for, and the id of that user, team, topic, podcast episode, or Topic Post. a film's image
		// names its podcast episode
		subjectKind: uncheckedImageSubjectKind("subject_kind").notNull(),
		subjectId: text("subject_id").notNull(),
		// who uploaded it, the one user who sees it while it waits for its check. null once that account closes
		uploaderUserId: text("uploader_user_id").references(() => users.id, { onDelete: "set null" }),
		// an avatar's stored object, or any other image's content hash
		avatarKey: text("avatar_key"),
		imageHash: text("image_hash"),
		// the pixel size of a topic image's original
		width: integer("width"),
		height: integer("height"),
		// whether the image is already its subject's current one
		isPublished: boolean("is_published").notNull().default(false),
		// when it was uploaded, how many checks since could not run, and when it was reported as unchecked for over a day
		uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
		attemptCount: integer("attempt_count").notNull().default(0),
		reportedAt: timestamp("reported_at", { withTimezone: true }),
	},
	// one unchecked image for each subject, and an avatar names its object while any other image names its hash
	(table) => [
		uniqueIndex("unchecked_images_subject_unique").on(table.subjectKind, table.subjectId),
		check(
			"unchecked_images_key_shape",
			sql`(${table.subjectKind} in ('userAvatar', 'teamAvatar') and ${table.avatarKey} is not null and ${table.imageHash} is null) or (${table.subjectKind} not in ('userAvatar', 'teamAvatar') and ${table.imageHash} is not null and ${table.avatarKey} is null)`,
		),
	],
)
