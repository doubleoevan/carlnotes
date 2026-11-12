// the daily view and play daily-counts: each item's views and each podcast episode's plays per UTC day and place, with
// the distinct people behind them. no address, user, or individual view or play is stored

import { date, index, integer, numeric, pgTable, primaryKey, text } from "drizzle-orm/pg-core"
import { bytea, podcastEpisodeFormat, viewItemKind } from "./columns"
import { podcastEpisodes } from "./podcast"

// the place columns both daily counts share. the key hashes the five values, and an unknown place has all five null
// biome-ignore lint/nursery/useExplicitReturnType: drizzle's column builder types are generated, and naming them here would break on an upgrade
function placeColumns() {
	return {
		placeKey: text("place_key").notNull(),
		country: text("country"),
		region: text("region"),
		city: text("city"),
		// the decimal coordinates exactly as Cloudflare sent them
		latitude: numeric("latitude"),
		longitude: numeric("longitude"),
	}
}

// one item's views on one UTC day in one place. the item, a topic, a finding, or a Topic Post, has no foreign key, and
// a deleted item's rows age out with the retention delete
export const dailyViewCounts = pgTable(
	"daily_view_counts",
	{
		itemKind: viewItemKind("item_kind").notNull(),
		itemId: text("item_id").notNull(),
		day: date("day").notNull(),
		...placeColumns(),
		// the views, and the HyperLogLog of the distinct people behind them
		viewCount: integer("view_count").notNull().default(0),
		viewerSketch: bytea("viewer_sketch"),
	},
	// covers a day's rows for an item and the retention delete
	(table) => [
		primaryKey({ columns: [table.itemKind, table.itemId, table.day, table.placeKey] }),
		index("daily_view_counts_day_idx").on(table.day),
	],
)

// one podcast episode's plays in one format on one UTC day in one place
export const dailyPlayCounts = pgTable(
	"daily_play_counts",
	{
		podcastEpisodeId: text("podcast_episode_id")
			.notNull()
			.references(() => podcastEpisodes.id, { onDelete: "cascade" }),
		format: podcastEpisodeFormat("format").notNull(),
		day: date("day").notNull(),
		...placeColumns(),
		// the plays, and the HyperLogLog of the distinct people behind them
		playCount: integer("play_count").notNull().default(0),
		listenerSketch: bytea("listener_sketch"),
	},
	// covers a day's rows for a podcast episode and the retention delete
	(table) => [
		primaryKey({ columns: [table.podcastEpisodeId, table.format, table.day, table.placeKey] }),
		index("daily_play_counts_day_idx").on(table.day),
	],
)
