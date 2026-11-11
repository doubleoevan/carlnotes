# Proposal

## Why

People only read on CarlNotes today. A Topic's owner and team have nowhere to write about it, nobody learns that a
Comment mentioned them until the next day's email, and the profile page is two tables. The home's Brews News card lists
unread Findings and says nothing about the podcast episodes, Comments, and reactions that arrived since the last visit.
The Social design page in Notion settles the next step, and this change builds it on web, mobile, and MCP.

## What Changes

- **Café.** The profile page reads as the person's Café: the heading is the username then Café, the avatar is the size
  of a Topic page's image, and the page lists the header, Brews News, Featured Topics, Featured Podcasts, Featured
  Posts, the topics and teams tables, and a Visitors line. The word profile leaves customer copy. Code keeps `profile`.
- **Featured picks.** The Café's owner pins up to 12 Topics and 12 Podcast Episodes from the Café's action menu. With
  none pinned, each section falls back by the home sections' rules, and each section pages through all of the person's
  Topics or Podcast Episodes.
- **Featured posts.** A third Featured section, of Topic Posts, sits right below Featured Podcasts on the Café and the
  team page, and below New podcasts this week on the home. An author pins any number of their published posts from
  the Café's action menu, and an admin pins the home's from the home page's. After the pins, the Café lists every
  other post of the person, the team page every other post of its Topics, and the home the newest post of each other
  Topic. The home adds New posts this week right below, for the last seven days' posts.
- **Visitors.** The Café and Team pages count their viewers as Topic pages do, and show the count as Visitors.
- **Brews News.** The home's Brews News card keeps Carl's opener and replaces the unread Findings list with the news:
  the podcast episodes, Topic Posts, Comments, reactions, and Findings of a Week, Day, or Hour window, ordered own
  things, then teams' things, then followed Topics. The same component leads every Café.
- **BREAKING** The updates list and its 5, 15, and 30 minute button leave the web and mobile home. `read_updates` and
  its MCP view stay, and that view's heading stops reading Brews News.
- **Open Mic.** A Topic's owner and team members publish Topic Posts of 300 words or more in the Tasting Notes editor.
  Each has a draft, a page nested in its Topic's route, a generated image, an AI summary, a comment thread, a chat, and
  a recorded Coffee Break Discussion. Published Topic Posts join the Topic's Scan context.
- **Coffee Break Discussion.** Carl and Vienna discuss a Topic Post in audio with no music, reading the post and its
  shared Comments, recorded once on publish and again only through a limited Regenerate.
- **Mention badges.** A Comment Mention stays unseen until the mentioned person scrolls to its Comment. Unseen mentions
  count on the header badge, on the title of the page that holds them, and on that page's Hot takes section, and each
  badge opens one list that leads to the Comment.
- **MCP.** `read_news`, `read_topic_posts`, and `read_topic_post` return the same components as MCP views. Publishing
  stays on web and mobile.
- **Search.** Published Topic Posts are a kind of search result, with a Posts choice in the Filters menu and in the
  MCP `search` tool.
- **Chat from the launcher.** The post's page holds no chat of its own. The chat launcher opens the Topic's private
  chat about the open post, and a private chat is named for what it is about.
- **Sharing a post.** A published Topic Post is shared through its Topic's share options, with its own preview card,
  and an invite link shared from a post opens the post.
- **Details lines.** A wrapping line of details sits under the byline of the topic page, the Topic Post page, the
  Café, and the team page, and a section's title shows its count at the far right.
- **Transcript.** The discussion card's name opens the recording's transcript, which the server's HTML holds.
- **Page polish.** A top row's two buttons are one size, an image of a thing with its own page opens that page, a
  page's loading state matches the page it becomes, and the header keeps its links without JavaScript.
- **Topic page read.** The topic page's reads start together, and a signed-in web page loads Similar topics in a
  read of their own.
- **Docs.** The domain model, the privacy policy, and the Persona & Voice page name the new nouns and copy.

## Capabilities

### New Capabilities

- `news`: the windowed list of News Events on the signed-in home and on every profile page, its order, who reads what,
  its paging, and its limits.
- `topic-posts`: Topic Posts on a Topic: drafts, publishing, editing, deleting, the page, the card, the image, the
  summary, the Scan context, and who may read and write one.
- `topic-post-discussions`: the recorded two-host discussion of a Topic Post, its length, its regeneration limit, its
  billing, and its screen before speech.
- `topic-post-chat`: the private chat about one Topic Post.
- `comment-mention-badges`: unseen Comment Mentions, the three badges, the mentions list, the link to the Comment, and
  the seen rule.
- `profile-featuring`: the profile orders a person sets on their own Topics, Podcast Episodes, and Topic Posts, and
  the three Featured sections on the profile page.

### Modified Capabilities

- `public-profiles`: the profile page's copy says Café, its sections follow a fixed order, its buttons sit in a row
  under the search bar, its summary line counts its topics, podcast episodes, and teams, and the user menu's entry
  reads Café beside the user's avatar.
- `home-page`: the user face shows the Brews News card with the opener and the news in the Updates card's place, and
  the home adds Featured posts and New posts this week, which an admin pins from the home page and from a post's page.
- `updates`: the updates list leaves the web and mobile home, and the opener is read on its own.
- `viewer-counts`: profile viewers and team viewers are counted, synced, read, and shown as Visitors.
- `comment-threads`: a Comment on a Topic Post starts unshared, whoever writes it, and a thread's page counts its
  Comments and replies in all.
- `content-reporting`: a Topic Post's image is a report subject, and an admin's Regenerate on it drops an upload and
  generates the image again on the platform's budget.
- `site-search`: a click on a Topic result's row opens the Topic's note, and its title and image open the Topic.
  Published Topic Posts are a result kind with their own row, and the Filters menu turns them on and off.
- `notifications-email`: a mention's quote holds only the Comment's first line, and a Comment on a Topic Post names the
  post.
- `topic-featuring`: the Rank dialog's Save is enabled whether or not a row moved, so the first pin of all saves.
- `design-system`: a page section's title is the `sectionTitle` type role with its count at the far right, and no
  count at zero. A details line under a page's byline wraps between details and leaves out a count of zero. An empty
  list shows its line in a card, a closed section of a stacked column shows a divider, a top row holds one
  highlighted button beside a plain one of the same size, an image of a thing with its own page opens that page, and
  a page's loading state matches the page it becomes.
- `feed-homepage`: the topic page counts its sections on a details line under its byline and reactions.
- `teams`: the team page's heading reads as the team's Franchise beside a larger avatar, and it features its Topics,
  their Podcast Episodes, and their Topic Posts as cards in the owners' and authors' combined profile order. Its
  buttons sit in a row under the search bar, and its summary line counts its podcast episodes and notes.
- `team-chat`: a private chat is named for what it is about: the Topic Post, else the Topic, else the team.
- `seo`: the header keeps a visitor's links as plain anchors without JavaScript.
- `mcp-server`: three read tools for the news and Topic Posts.
- `mcp-views`: the news, topic posts, and topic post MCP views.
- `related-topics-and-episodes`: a signed-in web topic page loads Similar topics in a read of their own, and a
  visitor's page keeps the list inline.

## Impact

- **Schema** (`packages/db/schema/`): new `topic_posts` and `topic_post_discussions`; `comment_mentions.seen_at`;
  `comments.target_topic_id` and `reactions.target_topic_id`; a foreign key on both `post_id` columns;
  `topics.profile_order`, `episodes.profile_order`; `users.profile_viewer_count`, `teams.viewer_count`, and two
  `viewer_counters` references; a `topic_post` chat turn kind; a Topic Post reference on `topic_image_renders`. One
  generated migration backfills the two `target_topic_id` columns.
- **API** (`apps/api/`): new `news/`, `topicPost/`, and comment mention routes; profile order routes beside
  `topic/homeOrder.ts`; view and count routes for profiles and teams; an opener route; page head, share image, and
  structured data for the Topic Post page; the sitemap; three MCP tools.
- **Worker and pipeline**: a Topic Post workflow for the image, the summary, and the discussion, on the podcast and
  topic image code; the viewer count sweep; the Scan context builder.
- **Shared UI** (`packages/core`, `packages/nightshift`): `NewsList`, `ProfileHeader`, `CardsSection`, `TopicPostCard`,
  `TopicPostPage`, `TopicPostEditor`, `CommentMentionBadge`, `CommentMentionList`, and a rank dialog both apps render.
- **Web, mobile, MCP views**: the profile page and screen, the home, the Topic page and screen, a Topic Post route and
  screen, the user menu, and three MCP views with `MCP_VIEW_VERSION` raised.
- **Contracts**: new route contracts in `packages/contracts/apiRouteContracts.ts` and a refreshed freeze.
  `profileResponse` and the home payload only gain fields.
- **Cost**: each published Topic Post spends one image render, one summary call, and one discussion recording on its
  publisher's plan.
- **Docs**: `.agents/skills/domain-model/SKILL.md`, `apps/web/src/pages/PrivacyPage.tsx`, the Notion Persona & Voice
  page, `apps/mobile/parity.md`, and the workspaces' AGENTS.md files.
