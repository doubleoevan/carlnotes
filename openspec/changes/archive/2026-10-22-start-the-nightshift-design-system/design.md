## Context

- `packages/tokens` is a CSS-only universal package: `tokens.css` holds the `@theme inline` block, the Latte palette on
  `:root`, and the Dark roast palette under `.dark`, 42 hex colors and two `rgba` ring lines. `apps/web/src/globals.css`
  imports it, and nothing else reads it.
- `packages/emails` writes its own palette as literal `CSSProperties`, one set per template: 16 hex colors in 36
  places, eight pixel font sizes from 11 to 22, and one system font stack. Only `#f09050` is a token. The api's
  unsubscribe page and blog pages copy that palette, and the share image, the podcast cover, the theme-color
  meta, and `site.webmanifest` copy token values by hand.
- The web app renders type with Tailwind's sizes: `text-sm` 183 times, `text-xs` 110, `text-2xl` 26, `text-lg` 22,
  `text-base` 11, `text-xl` 5, `text-3xl` 3, `text-4xl` 3, with `font-semibold` 73, `font-normal` 22, `font-bold` 16,
  `font-medium` 9, and `font-display` 63 times.
- There is no catalog of components. Twelve shadcn primitives sit beside 18 shared components in `components/common`,
  20 in `components/table`, and 8 in `components/layout`, and many patterns exist only as class strings in
  `apps/web/src/lib/styleClasses.ts` or as Tailwind written by hand.
- Packages export TypeScript source with no build step. The Dockerfile builds the web app with Vite and the docs with
  Astro in its build stage, and the api serves both from the runtime stage. The api sends `frame-ancestors 'none'` by
  default.
- The Notion Mobile page decided that the coming Expo app renders the same vocabulary with React Native and Uniwind.
  Uniwind writes light and dark as `@variant` blocks under `:root` in `@layer theme`, where the web app switches on a
  `.dark` class.

## Goals / Non-Goals

**Goals:**

- Rename the package to `@carlnotes/nightshift` and make its TypeScript the one home of every token and type role.
- Write `tokens.css` and the Figma files from that source, with tests that keep them in step.
- Point the emails and every hand copy of a brand color at the source, with each visual change mapped and reviewed.
- Inventory every common component pattern, and show it, with the tokens and type, in a Storybook at `/nightshift`.
- Lay the source out so the Uniwind theme is one more renderer later.
- Once the move is proven, bring every text color to the 4.5:1 body text ratio of the Web Content Accessibility
  Guidelines (WCAG) 2 at level AA, on every surface it sits on, and fix what the component browser's checks find.

**Non-Goals:**

- No new shared component, no call site moved onto an existing component, no merging of the two pagination
  components, no variant recipes or props contracts, no CVA sweep, and no published npm library. Button and badge are
  already CVA-shaped and are the first recipes the mobile stage extracts.
- `styleClasses.ts` stays in the web app until each pattern's vocabulary is decided, since mobile renders a table as a
  card per row.
- No mobile stories. They arrive with `apps/mobile`, through Storybook for React Native, and can join `/nightshift`
  later through composition of a static web build.
- No change to the web app's computed styles from the move into TypeScript, and no new Tailwind utility for the type
  roles. The contrast fix in section 8 changes seven color tokens on purpose, after section 11 proves the move changed
  nothing.

## Decisions

### 1. The rename

`git mv packages/tokens packages/nightshift`, and the package becomes `@carlnotes/nightshift`, private and universal.
The references that move with it: `apps/web/package.json`, the `@import` in `apps/web/src/globals.css`, both Dockerfile
`COPY` lines, `UNIVERSAL_WORKSPACE_FOLDERS` in `scripts/packageBoundaries.ts` and the fixture in its test, the root
`AGENTS.md` module map, `packages/nightshift/AGENTS.md`, `apps/web/AGENTS.md`, `.agents/commands/audit-structure.md`,
and the lockfile. `README.md` has no reference today and gains the new scripts. A search for `carlnotes/tokens` and
`packages/tokens` outside `openspec/changes/archive` and this change's own docs finds two hits, both expected. The drift
list in `.agents/commands/audit-structure.md` records old names on purpose. The living spec
`openspec/specs/workspace-structure/spec.md` still names the old package until the archive rewrites it from this
change's delta. The workspace-structure requirement that names the universal packages changes to the new name.

The package now holds TypeScript, so it gains a `tsconfig.json`, joins the Biome universal rule beside `contracts`,
`client`, and `core`, and joins the root `tsconfig.json` references and the references of every workspace that
imports it. Its exports are `"./*": "./*.ts"` and `"./tokens.css": "./tokens.css"`. The Figma files have no export,
since a designer reads them from the repo and no code imports them.

The package boundary check in `scripts/packageBoundaries.ts` limits where the web app reads the package. Any web app
file may import `@carlnotes/nightshift/tokens.css`. Nightshift's TypeScript may be imported only from a test, a story,
`.storybook/`, or `src/nightshift/`, so no palette module reaches the browser bundle.

### 2. One source, laid out by mode

```
packages/nightshift/
  colors.ts         every color token: its light value, its dark value, and its description
  radius.ts         the base radius and the steps the scale takes from it
  typography.ts     the font families, the type roles, and the email font stack
  theme.ts          the semantic names the web theme maps for shadcn and for the app's extras
  email.ts          the email palette and the email font size of a role, read from the above
  units.ts          the pixels in a rem, and the rem to pixels conversions the other modules read
  tokensCss.ts      returns tokens.css as a string
  figmaTokens.ts    returns one mode's Design Tokens JSON as an object
  writtenFiles.ts   returns each written file's text by its path in the package, for the writer and the test
  tokens.css        written by the token writer, committed
  figma/light.tokens.json, figma/dark.tokens.json
  tokens.test.ts
  contrast.test.ts
```

A color token is one record with a `light` value, a `dark` value, and a `description`. A palette is read by mode, and
no source file names a selector: `tokensCss.ts` puts light on `:root` and dark under `.dark`, and a later
`uniwindCss.ts` puts both as `@variant light` and `@variant dark` blocks under `:root` in `@layer theme`, from the same
records. The comments in today's `tokens.css` move into the descriptions, so `tokens.css` and the Figma files have the
same words. `ring-line`, the one token the theme does not map, stays a token with no theme name.

The radius scale keeps today's CSS exactly: `--radius: 0.625rem` on `:root`, and `--radius-sm`, `-md`, `-lg`, and `-xl`
as `calc` offsets of it in the theme. The source holds the base and the offsets, so the Figma renderer can write each
step as pixels.

The renderers are pure functions, so they stay in the universal package. `scripts/write-nightshift-tokens.ts` calls
them through `toWrittenFiles` and writes the three files, run as `bun run nightshift:write`. Nothing in the package
touches the file system.

### 3. tokens.css is committed and checked, not generated at build time

Generating `tokens.css` during the build would mean every consumer runs the writer first: `dev:ui`, `build:ui`,
`dev:storybook`, `build:storybook`, the Dockerfile, and the editor's Tailwind language server, which reads the CSS on
disk. A fresh checkout would fail its first `@import` until someone ran it. A Vite virtual module would not help,
because the Tailwind Vite plugin resolves `@import` itself. It would also give one package a build step when every
package exports source with none.

So the writer's output is committed, and `packages/nightshift/tokens.test.ts` renders the source in memory and compares
it with the committed `tokens.css` and both Figma files, byte for byte. A test may read files inside a universal
package. A hand edit or a forgotten rewrite fails preflight with a message naming the file and `bun run
nightshift:write`. The cost is one generated file in a token diff, which is also where a reviewer reads the change.

The rewritten `tokens.css` may differ from today's only in formatting and comment wording. The proof is the computed
style comparison in section 11.

### 4. The type roles

Each role is the class set the app already writes for that level. Sizes and line heights are the values those classes
give in Tailwind's default theme, which the test reads from `tailwindcss/theme.css`, so a role cannot drift from its
classes.

| Role | Classes today | Family | Size / line height | Weight | Where |
|---|---|---|---|---|---|
| `display` | `font-display text-4xl leading-tight`, `text-2xl` below `sm` | Architects Daughter | 36px / 45px, 24px / 30px on a phone | 400 | the hero tagline |
| `pageTitle` | `font-display text-2xl` | Architects Daughter | 24px / 32px | 400 | 17 page `h1`s, every `DialogTitle` |
| `sectionHeading` | `font-display text-lg` | Architects Daughter | 18px / 28px | 400 | `CollapsibleSection` titles, `POPOVER_HEADING_CLASS`, `h2`s and `h3`s |
| `label` | `text-sm font-semibold` | Karla | 14px / 20px | 600 | `h3`s in settings, accordion triggers, table emphasis |
| `body` | `text-sm` | Karla | 14px / 20px | 400 | tables, menus, popovers, dialogs, cards |
| `bodyLarge` | `text-base` | Karla | 16px / 24px | 400 | inputs and composers on a phone, which step down to `body` from `sm` |
| `caption` | `text-xs` | Karla | 12px / 16px | 400 | metadata, tooltips, badges, table pagination |
| `sectionLabel` | `font-display text-xs tracking-wide uppercase` | Architects Daughter | 12px / 16px | 400 | `SECTION_LABEL_CLASS`, which `FieldLabel` and six more files take |

The outliers the inventory found keep their classes: `font-display text-xl` on two `h2`s, `text-3xl` on the plans page,
`font-semibold` on the signup page's `h1`, and six arbitrary sizes from `text-[9px]` to `text-[13px]`. They are the type
stage's decisions, and naming a role changes no page.

The email font stack is its own entry, `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial,
sans-serif`, because web fonts do not load in most email clients.

### 5. The emails and the other copies

The rule: a color moves to the Latte token that plays the same role, unless no token does, and then it becomes a named
email token at today's value. The palette drops from 16 values to 9 tokens. Contrast is measured on the fill each
color sits on.

| Before | Where | After | Contrast before → after |
|---|---|---|---|
| `#2a1f14` | the button label | `primaryForeground` `#2a1c0f` | 6.75 → 6.93 on the button |
| `#2b2b2b` | `h1`, the recap headings, bold text | `foreground` `#332a22` | 14.16 → 13.83 |
| `#4b4b4b` | body text in the cards | `foreground` `#332a22` | 7.82 → 12.16 on the recap fill |
| `#5b5b5b` | the intro paragraph | `secondaryForeground` `#75604a` | 6.79 → 5.86 |
| `#6b5b4a` | muted text in the auth emails | `mutedForeground` `#705a40` | 6.52 → 6.41 |
| `#9a938a` | the footer's small print | `mutedForeground` `#705a40` | 3.04 → 6.41, now past 4.5 |
| `#a79c8c` | labels, ranks, hosts | `mutedForeground` `#705a40` | 2.42 → 5.63 on the recap fill, now past 4.5 |
| `#7c4a1e` | the logo, every link, finding titles | `link` `#8f4c17` | 7.35 → 6.43 on the container, 5.65 on the recap fill |
| `#f09050` | the button fill | `heroAccent` `#f09050`, unchanged | |
| `#ffffff` | the container | `card` `#fffdf9` | |
| `#faf8f4` | the finding card fill | `card` `#fffdf9` | |
| `#f4f1ea` | the page behind the container | `secondary` `#f4eee2` | |
| `#f7f2e9` | the recap and failure card fill | `secondary` `#f4eee2` | |
| `#ece2d2` | the recap and failure card border | `muted` `#efe6d8` | |
| `#ece7de` | the container border, the divider | `muted` `#efe6d8` | |
| `#efeae0` | the finding card border | `secondary` `#f4eee2` | |

The fills and borders move by a CIEDE2000 difference of 2.4 or less, which reads as the same color. The visible changes
are text: the neutral grays turn warm brown, and the three muted grays become one, which also lifts two of them past
the 4.5:1 body text ratio they fail today. The links move to `link`, a step lighter and warmer than `#7c4a1e`. The
token's value before the contrast fix in section 8, `#a35f2d`, read 4.29:1 on the recap fill, under 4.5, so the emails
first kept `#7c4a1e` as an email token of their own. The fix darkened `link` until it reads 5.65:1 there, and the
email token went away. The muted values are the ones after the fix too.

An email style takes its font size from a role, as pixels from the role's size. Its weight and line height stay as
written, because the email stack is not the display font and every email style already sets `lineHeight: "1.5"`.

| Before | Styles | Role | After |
|---|---|---|---|
| 11px | `summaryLabel` | `caption` | 12px |
| 12px | the shell's `footerText` and `footerLink`, `cardHost` | `caption` | 12px |
| 13px | `fallbackText`, `fallbackLink`, `failureNote` | `body` | 14px |
| 13px | the auth email's `footerText` | `caption` | 12px, matching the shell's footer |
| 14px | `summaryBody`, `podcastEpisodeDescriptionText`, `cardNote` | `body` | 14px |
| 15px | `summaryText`, `failureText`, `summaryHeading`, `podcastEpisodeTitleLine` | `bodyLarge` | 16px |
| 16px | the button, `cardTitle` | `bodyLarge` | 16px |
| 18px | `brand` | `sectionHeading` | 18px |
| 22px | `h1`, the cup | `pageTitle` | 24px |

The other copies read the same source:

| File | Before | After |
|---|---|---|
| `apps/api/unsubscribe.ts` | the email palette: `#f4f1ea`, `#2b2b2b`, `#fff`, `#ece7de`, `#7c4a1e`, `#5b5b5b` | the email mapping above |
| `apps/api/content.ts` | `#f4f1ea`, `#2b2b2b`, `#7c4a1e`, `#6b5b4a` | the email mapping above |
| `apps/api/share/previewImage.ts` | `#2a1f14`, `#f0e6d6`, `#f09050`, `#b9a68e` | dark `card` `#302417`, dark `foreground`, dark `primary`, dark `heroMuted` `#b3a48c`, and `PREVIEW_TEMPLATE_VERSION` moves from `v3` to `v4`, because Slack and X keep a card until its url changes |
| `apps/api/share/podcastCover.ts` | `#f09050`, `#f3e9db`, `#332a22` | `heroAccent`, `heroForeground`, `foreground`, unchanged, so the cover's template version stays |
| `apps/web/src/hooks/useTheme.ts`, read by `apps/web/src/routes/__root.tsx` | `#3b2a1d`, `#0f0c09` | stay literals in `useTheme.ts`, and `useTheme.test.ts` checks them against light and dark `hero` |
| `apps/web/public/site.webmanifest` | `#0f0c09` | stays JSON, and `useTheme.test.ts` checks it equals the dark `hero` |

The web app's two hero colors stay written by hand because importing the source into the browser bundle would put
the whole color table into the main chunk for two values. `__root.tsx` now reads them from `useTheme.ts` instead of
writing them a second time.

The api pages keep their own font sizes and their black shadow, which are page layout, not palette.
`packages/contracts/avatars.ts` keeps its avatar background palette: it already has one home, and it moves with the
avatar component in a later stage.

A test in `packages/emails` fails on a hex literal or a pixel `fontSize` in any template. Every email's preview props,
the unsubscribe page, a blog post page, a share image, and a podcast cover are rendered before and after, as HTML
and as a PNG 600 pixels wide, into this change's `renders/before/` and `renders/after/` folders. The apply records what
changed in each pair below this paragraph. The one style the render tests read, `cardNumber`'s weight 400, keeps its
weight.

What the renders show, every value in the HTML moving exactly as the tables above map it:

| Render | What changed |
|---|---|
| `auth-email`, `topic-invite-email`, `team-invite-email` | The heading grows from 22 to 24 pixels and turns warm near-black. The intro grows from 15 to 16 pixels and turns warm brown, wrapping one line sooner. The pasted link and its label grow from 13 to 14 pixels, and the small print shrinks from 13 to 12 pixels to match the shell's footer. The small print now shares the shell footer's style, so its line height moves from react-email's 24-pixel default to 1.5, 18 pixels at 12. The page behind the card warms a step. The muted text moves from `#6b5b4a` to `#705a40`, a hair lighter, and the links turn from `#7c4a1e` to the `link` token's `#8f4c17`, a step lighter. The button is unchanged. |
| `topic-scan-email` | The same heading, intro, and link changes. The muted labels, ranks, and hosts darken from `#a79c8c` to `#705a40` and read clearly. The body text in the cards turns warm near-black. The recap and podcast cards keep their tint, and the finding cards sit on the container's own fill with a faint border instead of a fill a shade off white. The podcast title line and the recap headings grow from 15 to 16 pixels, so the podcast title wraps one line sooner. |
| `manual-scan-email`, `manual-scan-email-failed` | As the scan email. The failure text grows from 15 to 16 pixels, and the failure note from 13 to 14. |
| `unsubscribe-page`, `blog-page` | The page background warms a step, the text turns warm near-black, the paragraph and the post date turn warm brown, and the card's white is the token's warm white. The links and the unsubscribe button turn from `#7c4a1e` to `#8f4c17`. Sizes are unchanged. |
| `team-share-card` | The card's background moves from `#2a1f14` to the dark card `#302417`, a step lighter, and the counts from `#b9a68e` to `#b3a48c`. |
| `podcast-cover` | Byte for byte the same. |

### 6. The Figma files

The token writer writes `packages/nightshift/figma/light.tokens.json` and `dark.tokens.json` in Design Tokens Community
Group format 1.0, the format Figma's variable import and export reads. A color is
`{ "colorSpace": "srgb", "components": [r, g, b], "alpha": a, "hex": "#rrggbb" }`, so the ring lines keep their alpha. A
radius step is a `dimension` in pixels, 6, 8, 10, and 14, because Figma measures in pixels. A type role is a group of
single-value tokens, `fontFamily`, `fontSize`, `lineHeight`, and `fontWeight`, instead of one composite `typography`
token, because a Figma variable holds one value. A role with letter spacing, the section label, gets a fifth
single-value token, `letterSpacing`, in pixels. The two files hold the same token names, so Figma reads them as two
modes of one collection.

They are committed for the same reasons `tokens.css` is: a designer downloads them from the repo without Bun, and the
same test keeps them in step.

### 7. The inventory

Counted in `apps/web/src`, with tests, stories, `src/nightshift/`, and `routeTree.gen.ts` excluded. The Inventory page
in the component browser repeats this table.

| Pattern | How it is built today | Where | Nightshift name |
|---|---|---|---|
| Button | 134 raw `<button>` in 74 files; the `Button` primitive in 42 files (64 tags; `outline` 15, `ghost` 9, `destructive` 3, `link` 1, `secondary` 0); `buttonVariants` on links in 9 files; `MENU_BUTTON_CLASS` 8 files; `HERO_BUTTON_HOVER_CLASS`, a ghost button's hover on the hero band, 2; the primary fill written 5 ways | chat, topic, and podcast hold most raw buttons; pages, modals, and tables use the primitive | `Button` |
| Icon button | `IconButton` in 7 files (11 uses, most overriding its class); `ICON_BUTTON_CLASS` from `styleClasses.ts` in 4 files, and two more local constants of that name with other sizes; `ICON_TILE_BUTTON_CLASS` 3; `SEARCH_BAR_ICON_CLASS` 3; `Button size="icon"` and `"icon-sm"` in 6 files; round `SEND_`, `PLAY_`, and question buttons | composers, tables, the podcast player | `IconButton` |
| Menu | no menu component and no `role="menu"`: `Popover` with `MENU_OPTION_CLASS` (16 files, 38 uses), `MENU_OPTION_SELECTED_CLASS` (7), `MENU_DIVIDER_CLASS` (8); two near copies, `SHARE_OPTION_CLASS` and `SUGGESTION_OPTION_CLASS`; seven panel widths | `UserMenu`, `HeaderMenu`, `ChatOptionsMenu`, `ReplyToDropdown`, `TagPicker`, `TopicFeedSort`, share menus, and ten more | `Menu`, `MenuItem`, `MenuDivider` |
| Select and combobox | the `Select` primitive in 5 files; native `<select>` in 3; `MultiCombobox` with 2 consumers; three hand-built filter lists with one copied filter input class | topic editing, tables, admin | `Select`, `Combobox` |
| Popover and info panel | the `Popover` primitive in 27 files; `POPOVER_PANEL_CLASS` 6 files; `POPOVER_HEADING_CLASS` 5; `ScrollBox` exported from `topic/TopicScanRecap.tsx` and used in 5 files; two header popovers with their own heading | resource and topic info, scan history, theme song | `Popover`, `InfoPanel`, `ScrollBox` |
| Tooltip | the primitive in 52 files (86 uses); `IconButton`'s own; `PodcastEpisodeTooltip`; `TooltipSection` and `TooltipLabel` in 3 files | everywhere | `Tooltip` |
| Dialog and confirmation | `Dialog` in 19 files: 5 named `*Modal`, 9 `*Dialog`, and 5 others (`ShareTopic`, `ShareTeam`, the two gates, and the consent page); `ConfirmDialog` in 10 files; no alert dialog | edit, share, invite, gate, consent | `Dialog`, `ConfirmDialog` |
| Card | `CARD_CLASS` 5 files, `INFO_CARD_CLASS` 7, `RESOURCE_LIST_CARD_CLASS` 5, differing in border and padding; `TableCard` in 15 files; seven exported `*Card` components and four local ones; `bg-card` by hand in 18 files | tables, topic and podcast sections, plans, admin | `Card`, `InfoCard`, `ListCard` |
| Table | `TABLE_CLASS` and `TABLE_SCROLL_CLASS` in 14 files each, `TABLE_HEAD_CLASS` in 13; `SortableHeader` in 11; `PagedTableSection` in 2 | activity, profile, team, admin, notes | `Table` |
| Pagination | `common/Pagination.tsx`: numbered pages, 1-based, link mode without JavaScript, 3 consumers; `table/TablePagination.tsx`: a rows select and previous and next, 0-based, with its hooks, 11 consumers | lists and tables | `Pagination` |
| Badge and count | the `Badge` primitive in 5 files; `CountBadge` 3; `UpdateCountBadge` 6 consumers; `PageUpdateCountBadge` 5; the podcast pill near the badge base; one 10px size written two ways | tags, unread and mention counts, podcast | `Badge`, `CountBadge` |
| Scroll box | `THIN_SCROLLBAR_CLASS` through `TABLE_SCROLL_CLASS` and in `TeamSubtablesRow`; `HIGHLIGHT_SCROLLBAR_CLASS` in 4 files; `useScrollRegionTabStop` with `SCROLL_REGION_FOCUS_CLASS`, a tab stop while the content overflows, in 3; the `scrollbar-none` utility, applied once to the note editor's formatting bar in `components/note/noteEditor.css`; `overflow-y-auto` in 13 files, 9 of them with the default bar | dialogs, popovers, transcripts, chat, lists | `ScrollBox` |
| Accordion and section | the `Accordion` primitive in 8 files besides `CollapsibleSection`, its triggers in the body font; `CollapsibleSection` in 8 files, in the display font; no tabs | pages, topic and podcast sections | `Section` |
| Form field | `Input` 15 files; raw `<input>` 14; `Textarea` 3; raw `<textarea>` in the 3 composers; `Label` 4; raw `<label>` 6; `FieldLabel` 5 files, a `label` tied to its field by `htmlFor`, or a `div` heading over a group of fields without it; `Switch` 10; two radio styles; no checkbox; `SECTION_LABEL_CLASS`, the section label, in `FieldLabel` and 6 more files | settings, modals, invites, composers | `Field`, `Input`, `Textarea`, `Switch`, `Section label` |
| Avatar | `UserAvatar` 11 files, which reads the session; `TeamAvatar` 10; both render the one `Avatar`, the only file with `AVATAR_CLASS`; `HostAvatar` 2; two pickers | headers, tables, chat, notes | `Avatar` |
| Chat bubble and composer | `ANSWER_BUBBLE_CLASS` in 2 files; `QUESTION_BUBBLE_CLASS` 1; `ChatRoomMessageBubble` writing both again; three composers, two sharing `COMPOSER_BAR_CLASS`, `COMPOSER_FRAME_CLASS`, `COMPOSER_BOX_CLASS`, and `SEND_BUTTON_CLASS`, and the topic prompt's copying the box; one attachment chip written twice | chat, team chat, topic prompt | `ChatBubble`, `Composer`, `AttachmentChip` |
| Loading | `CoffeeLoading` in 23 files, 4 of them routes that pass it as the pending component, with five size overrides; `LoaderCircle animate-spin` in 3; `LinkPreviewLoading` 3; no skeleton primitive, `animate-pulse` in 52 lines across four local skeleton sets, two of them named `TopicSkeleton`, and in 2 single placeholders | pages, cards, chat | `Loading`, `Skeleton` |
| Empty state | no component; a muted `text-sm` paragraph with five paddings | findings, tables, team, activity, notes | `EmptyState` |
| Text link | `AnchorLink` in 64 files, with `isNewTab` in 7 for a link that opens in a new tab; `STANDALONE_LINK_CLASS` in 29 for a link that stands alone, `sentence-link` in 20 for a link inside a sentence | everywhere | `TextLink` |
| Page frame and header | `PAGE_CLASS` in 12 pages; `SESSION_PAGE_CLASS` 3; `PAGE_HEADER_CLASS` and `PAGE_TITLE_CLASS`, the title row and its `font-display text-2xl` `h1` with an icon, in 4 pages | pages | `Page`, `PageHeader` |
| Toggle | `aria-pressed` buttons in 11 files; `Switch`; `ThemeToggle`; `RatingThumbs` | filters, ratings, theme | `Toggle` |
| Copy and share | `copyToClipboard` in 7 files; `CopyMarkdownButton`; `CopyLinkOption` 3; the copied state written three times; `SHARE_OPTION_CLASS` in 4 files | chat, invites, share menus | `CopyButton`, `ShareMenu` |
| Toast | `toast` from `sonner` in 50 files: `toast.error` 66 calls, `toast()` 52, `toast.success` 3 | everywhere | `Toast` |
| Separator | `DASHED_ROW_CLASS` 5 files, 4 of them with `LIST_ROW_HOVER_CLASS` for the row under the pointer; `INFO_CARD_SECTIONS_CLASS`, the dashed lines between an info card's sections, 2; a local `DASHED_SEPARATOR_CLASS`; `MENU_DIVIDER_CLASS` | lists, info cards, menus | `Separator` |

### 8. The component browser

**Setup.** Storybook 10.6.2, pinned exactly, with `@storybook/tanstack-react`, which wraps each story in a
memory-backed TanStack Router whose navigation calls are spies, and mocks TanStack Start's server functions. The app has
no server function today. `storybook`, `@storybook/tanstack-react`, `@storybook/addon-docs`, `@storybook/addon-a11y`,
`@storybook/addon-themes`, and `@storybook/addon-mcp` are `apps/web` dev dependencies, added with `bun add -d` and
configured by hand, since the init command scaffolds example stories this change would delete. Storybook's CLI reads
`bun.lock` and uses Bun with no extra step. The builder loads `apps/web/vite.config.ts` itself, so Tailwind v4's Vite
plugin runs as in the app, and the framework strips the TanStack Start plugin. The framework's peer range covers this
app's Vite 8, React 19, and TanStack Router and Start versions. The current release, 10.6.3, came out a day before
the apply, and `bunfig.toml`'s `minimumReleaseAge` rejects a package younger than three days, so the apply installed
10.6.2 from 2026-10-12 for every Storybook package, which keeps them in step.

`apps/web/package.json` gets `dev:storybook` (`storybook dev -p 6006 --no-open`) and `build:storybook` (`storybook
build --output-dir dist/nightshift`), and the root gets `dev:storybook` and `build:storybook`, each through `bun run
--cwd apps/web` with `STORYBOOK_DISABLE_TELEMETRY=1`, which is the one setting that also stops the first boot event.
`main.ts` sets `core.disableTelemetry` too, and `features.componentsManifest`. Writing the build into `apps/web/dist`
keeps it out of git and the Docker context by the rules that already exist.

**Stories.** A component's story sits beside it as `<Component>.stories.tsx`, so `components/primitives`,
`components/common`, `components/table`, and `components/layout`, 58 component files, each get one. Each story's
`argTypes` cover the component's variants and props, so the controls panel shows them. The pages and the pattern stories
live in `apps/web/src/nightshift/`: `Tokens.mdx` and `Typography.mdx`, whose swatches and specimens map over the
TypeScript source, `Inventory.mdx` with the table in section 7, and one story per class-only pattern, composed from
`styleClasses.ts` as the app writes it: the menu, the three cards, the info panel, the scroll boxes, the table, the chat
bubbles and the composer box, the section label, the dashed row, and the page frame. The pages' tables, the inventory
and each type role's values, render through `ScrollingTable.tsx` in the app's table classes, so their first column stays
put while the rest scrolls under it, as an app table's does.

**Light and dark.** `preview.tsx` imports `globals.css`, registers the light and dark toolbar themes with
`DecoratorHelpers.initializeThemeState`, and a decorator puts the `dark` class on the preview's `html` element before
the story renders, as the app's head script does, and remounts the story when the theme changes.

**The frame.** The browser's own sidebar and toolbar are branded Nightshift. `manager.ts` builds Storybook's theme from
the Dark roast palette, the radius scale, and Karla, all imported from `@carlnotes/nightshift`, so no color is written
twice. The brand shows Carl's avatar, `apps/web/src/assets/carl-avatar.png`, round as the app draws it, beside the name
Nightshift, and links to carlnotes.com. Storybook shows a `brandImage` alone and hides the title, so the avatar sits in
the title's markup instead. `main.ts` sets the CarlNotes icon, `apps/web/public/favicon.svg`, as the favicon, which
Storybook serves in dev and copies into the build. It links the font stylesheet from `FONT_STYLESHEET_URL` in the
source, which a test keeps equal to the one `globals.css` imports. Storybook writes the tab title as "<title> - <story>
⋅ Storybook" on every story, so a short script in the head names Nightshift in its place. The onboarding checklists in
the sidebar and the menu, and the what's new notices, are turned off.

**Sessions and data.** `preview.tsx` automocks every `@carlnotes/client` module but one with `sb.mock(import(...))`,
so each function is a mock that does nothing until a story says otherwise. The one is the auth client: Better Auth
builds it as a proxy, which automocking cannot see into, and Storybook looks for a workspace package's mock file next
to its real path in `packages/client`, a universal package. So `main.ts` aliases `@carlnotes/client/authClient` to
`apps/web/.storybook/mocks/authClient.ts`, whose methods are spies. A decorator in `preview.tsx` reads a story's
`session` parameter, `visitor`, `user`, or `admin`, into `StorySessionContext`, and a story without one gets `visitor`.
The mocked `authClient.useSession` reads that context with `useContext`, so each story on a docs page gets its own
session. The sessions are in `apps/web/.storybook/fixtures.ts`. The shared fixtures are in that file and in one file per
domain under `apps/web/.storybook/fixtures/`. A story that needs data sets its mocks in `beforeEach` from those
fixtures. `Header` and `Layout` render the `TopicFeedProvider` over the mocked topic client in each story's `render`
function, inside the story's router, not in a decorator, which wraps outside the router. Both sit inside the preview's
one `QueryClientProvider`. Stores are seeded through their own exported setters. The fixtures name invented people at
`example.com`. The global `beforeEach` also replaces `fetch` with one that rejects any `/api` request on this origin,
so a missed mock shows as an error in the story instead of a call to the api, and puts `fetch` back after. No
component's markup or behavior changes for a story. Two modules export an existing value for their stories: `BRANDS`
in `apps/web/src/components/common/BrandIcon.tsx` and `LAST_AI_PROVIDER_KEY` in `apps/web/src/lib/installDeeplinks.ts`.

**Tailwind.** Tailwind's automatic source detection scans the web app's files, stories included, so a class written only
in a story would end up in the production CSS. `globals.css` adds `@source not` for `**/*.stories.tsx`,
`src/nightshift`, and `.storybook`, and the stories and pages use the app's own classes and inline styles for their
layout. The client-size check in section 11 proves nothing leaked.

**Accessibility.** `preview.tsx` sets `parameters.a11y.test: "error"` and runs axe's WCAG 2.0, 2.1, and 2.2 rules at
levels A and AA, so the addon fails a story's check in the UI on any violation of that bar. Axe's best-practice rules,
such as one main landmark and one `h1` per page, judge a whole page, not a component shown alone, so they are not part
of it. A `surface: "card"` parameter puts a story on the card fill when the app shows that component on a card, a table,
a popover, or a dialog, and `surface: "hero"` puts a header control on the header's hero band, so each story is checked
against the color it really sits on. The apply swept every story in light and dark with a scratch Playwright script that
opens each `iframe.html?id=` and runs axe with the same rules, at 375 pixels wide for the phone-only menu and 1000 for
the rest.

What the sweep found and the apply fixed, none of it visible:

- A label must contain its visible text (WCAG 2.5.3). `SubtableCountButton`'s name now ends with the count it shows,
  "Show Reading Group's members, 3". The topic info button in `TopicsTable` names its visible counts first. Five more
  components take a name from content, in place of an `aria-label` that replaced the visible text.
  `UpdateCountBadge` and `UserProfileLink` read their visible text, then a screen-reader-only suffix. The `UserMenu`
  and `HeaderMenu` triggers read a screen-reader-only label ahead of the avatar or the menu icon. Each option in
  `TeamMenuOptions` reads a screen-reader-only action ahead of the visible team name. The initials in `UserAvatar` and
  `TeamAvatar` are `aria-hidden`, as the image avatars' empty `alt` already is, so a name read from content no longer
  starts with them.
- Story bugs: plays that clicked through Radix's disabled pointer events or checked visibility mid-animation, a
  `DataTransfer` built from a plain object, and react-docgen reading `TeamInvitesTable`'s indexed array prop type,
  which the story works around with its own `argTypes` table.

**The contrast fix.** The first sweep found 11 more failures. Most were the palette itself: muted text, links, and
the dark destructive red fell under 4.5:1 on the page, in a subtable, or on a hovered row. Section 11 had already
proven that the move changed no computed value. The apply then moved seven color tokens in `colors.ts`, each by a small
step:

| Token | Light before → after | Dark before → after | Lowest ratio on its surfaces, before → after |
|---|---|---|---|
| `mutedForeground` | `#7a6449` → `#705a40` | `#c2b494` → `#c6b898` | 3.42 → 4.61 in light, 4.11 → 4.63 in dark |
| `link` | `#a35f2d` → `#8f4c17` | `#f09050` → `#ffa367` | 3.03 → 4.62 in light, 3.53 → 4.62 in dark |
| `destructive` | `#b5433a` → `#a7362f` | `#e0674f` → `#ffa08b` | 3.35 → 4.62 in light, 2.49 → 4.61 in dark |
| `badge` | `#b5773a` → `#805429` | `#f09050` → `#f3a774` | 2.26 → 4.62 in light, 3.53 → 4.58 in dark |
| `accentForeground` | `#75604a` → `#705a40` | unchanged | 4.40 → 4.82 in light, 4.39 → 4.75 in dark |
| `sunken` | `#d6c9ad` → `#e2d8c4` | unchanged | a fill |
| `accent` | unchanged | `#5d4a35` → `#584531` | a fill |

Muted text could not clear 4.5:1 on the old light subtable fill without turning darker than the page's other browns,
so a subtable in light mode now takes the page's own color, and its border and rules mark it. In dark mode the
destructive red turns coral, the one red that reads on the page. `packages/nightshift/contrast.test.ts` checks each
text token against every surface the app sets it on, 90 pairs across both modes, so a palette edit under 4.5:1 fails
preflight.

The components:

- Highlight-colored text moves from `text-primary`, 1.75:1 on the light page, to `text-link`: the button's link
  variant, the file drop overlay, the highlighted chat room name, the playing chapter, the idle podcast episode pill,
  the player's "new episode", the share menu's copied state, and the hover color of a finding's bookmark and read
  toggles.
- The destructive button's dark fill drops from 60 to 40 percent of the lighter red, so its white label reads 6.24:1
  on a card and 4.61:1 on the page.
- Sonner's light success, info, warning, and error text each darken by one to nine points of lightness, to 4.5:1 on
  their own fills. The dark ones already pass.
- A link inside a sentence takes `sentence-link`, a utility in `globals.css`: the link color with `faint-underline`,
  an underline at 40 percent opacity, 3 pixels below the text, which turns solid on hover. WCAG asks a link in running
  text to differ from the text around it by 3:1, or by something besides color, and no link color reaches both 4.5:1 on
  the page and 3:1 against the body text. The credits, chat replies, a scan's notes, the chat notices, the invite and
  team copy, the legal pages, the theme song credits, the session pages, a subscription's delete confirmation, the
  attachment note, the spend meter's upgrade line, the paused scan line, and links in notes and comments take it. The
  hero's "All of it." keeps its own orange and takes `faint-underline` alone. A link that stands alone, such as a table
  cell, a footer link, or a link alone in its line, keeps `text-link hover:underline`, which `STANDALONE_LINK_CLASS` in
  `styleClasses.ts` holds.
- Muted text no longer drops under 4.5:1 through an alpha: a read finding's host line, the source editor's section
  labels and screening note, and the share option a topic owner can still click read at full muted strength. A passed
  budget cutoff on the spend meter dims its circle, not its label.
- The `badge` token, the "N new" count beside a topic, moves with the six above, and the count no longer fades on
  hover. The open comment in a note keeps the mark's fill and gains a bar in the highlight color beneath it, since a
  stronger fill took the text in it under 4.5:1.
- The update badge's link grows from 16 to 24 pixels with `-m-1 p-1`, so the count stays where it was and the target
  meets WCAG 2.2's 24-pixel minimum.
- A scrolling popover body and a `ScrollBox` take a tab stop while their content overflows, from
  `useScrollRegionTabStop`, so a keyboard can scroll text with no link in it. The focus ring draws inside the box's
  edge.

What the apply lists instead of fixing:

| Where | Finding | Why it stays |
|---|---|---|
| `Primitives/Select` Open and GroupsAndDisabledOption | aria-hidden-focus: while the list is open, Radix hides everything outside it, the focusable trigger included | Radix also keeps focus inside the open list, so the hidden trigger cannot take focus. Each story turns the rule off in its own `a11y.config`, with a comment saying why |
| Icons in the highlight color, outside axe's checks | A followed topic's paw, a menu's check mark, the bookmark, and the coffee mug measure 1.75:1 on the light page, under the 3:1 WCAG asks of an icon that shows a state | Moving them to the link color changes the brand's orange in light mode, a decision for the owner |

The re-sweep ran the same rules over all 300 stories in light and dark, 600 renders, after the fix. The only
violation left is the Select rule above, on its two open stories in both modes. The stories the first sweep listed
check at error level again. Axe passes a link whose color matches the text around it in luminance, and most of the
app's components outside the four story folders have no story. A code review over the change found the rest of the
fixes above: the links in muted sentences, the alpha text, the badge, and the comment fill.

**The MCP server.** `@storybook/addon-mcp` serves `http://localhost:6006/mcp` while `bun run dev:storybook` runs, with
its dev and docs toolsets, which read the components manifest. Its test tool appears only with the Vitest addon, which
this change does not add. `.mcp.json`, new at the root, registers it for Claude Code as `{ "mcpServers": { "storybook":
{ "type": "http", "url": "http://localhost:6006/mcp" } } }`, and `opencode.json` adds `"storybook": { "type": "remote",
"url": "http://localhost:6006/mcp", "enabled": true }` beside `notion`. The built Storybook also serves its manifests at
`/nightshift/manifests/components.json`, which an agent can read without a local server. `apps/web/AGENTS.md` tells an
agent to search the catalog before it writes a component.

**A coverage test.** `apps/web/src/components/stories.test.ts` lists the `.tsx` files in the four folders, tests
excepted, and fails naming any without a sibling `.stories.tsx`.

**Stories stay out of the app.** In `apps/web`, a file other than a `*.stories.tsx`, a file in `.storybook/`, or a file
in `src/nightshift/` that imports a `.stories` path or a `storybook` or `@storybook/*` module fails the package boundary
check. So no app code pulls a story or Storybook into the web app's build.

### 9. Publishing at /nightshift

`apps/api/bundlePaths.ts` names `NIGHTSHIFT_BUNDLE_ROOT = "./apps/web/dist/nightshift"`. The routes are
`nightshiftRoute` in `apps/api/nightshift.ts`, which `apps/api/index.ts` mounts right after the docs and ahead of the
ui's files. Their tests are in `apps/api/nightshift.test.ts`.

- `GET` and `HEAD` `/nightshift` redirect 301 to `/nightshift/`, keeping the query. Storybook's files name each other
  by relative urls, which resolve from the wrong folder without the slash. The seo requirement that strips a trailing
  slash gains `/nightshift` beside `/docs`.
- `/nightshift/*` is `serveStatic` over the root with the prefix removed and `index.html` for the folder, the way
  `toDocsFilePath` does it, and an `onFound` that sets the cache header.
- An unmatched `/nightshift/*` path responds 404, so it never reaches the ui's handler.
- A header middleware, `setNightshiftHeaders`, sets the policy, `Cross-Origin-Opener-Policy: same-origin`, and
  `X-Robots-Tag` on every `/nightshift` response once the route has responded, the redirect and the 404 included.
- Every file outside the hashed assets gets an `ETag` from Hono's `etag()`, so a repeat visit revalidates the manager's
  3.3 MB runtime to a 304 instead of downloading it again.

**Caching.** Storybook's builder writes the preview through Vite, which names each file `assets/<name>-<hash>.<ext>`.
Everything else it writes has a fixed name: `index.html`, `iframe.html`, `index.json`, `sb-manager/*`, `sb-addons/*`,
`sb-common-assets/*`, `vite-inject-mocker-entry.js`, `manifests/*`, and Storybook's own font and favicon files.
`main.ts` turns off `project.json` with `core.disableProjectJson`, and its `viteFinal` turns off `copyPublicDir` and
drops the voice activity plugin's file copy, since a story loads the app's public files and the voice runtime from the
app's own root paths. That keeps the build at 15 MB instead of 32 MB. A path after `/nightshift/assets/` whose name ends
in `-` and an eight-character hash gets `IMMUTABLE_CACHE_CONTROL`. Every other file gets `REVALIDATE_CACHE_CONTROL` and
no `CDN-Cache-Control`, so the edge never holds a fixed-name manager file past a deploy. The release's edge purge clears
the `rendered` tag only, and these files never have it.

**The policy.** The default policy sends `frame-ancestors 'none'`, which would block the manager from framing its own
`iframe.html`. Every `/nightshift` response sets its own, as `apps/api/favicons.ts` does: the app's own frame sources
from `FRAME_SOURCE_DIRECTIVE` in `apps/api/contentSecurityPolicy.ts`,
`frame-src 'self' https://www.youtube-nocookie.com https://challenges.cloudflare.com`, so a story frames what the app
frames, then `frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`. The default middleware
keeps a header a route set.

**Isolation.** A built Storybook preview takes channel messages from any window that holds a handle to it, and it runs
on the app's origin, where the session cookie lives. A site that opened `/nightshift/iframe.html` in a popup could post
forged story args and render its own markup there. `frame-ancestors 'self'` already keeps another site from framing the
browser, and `Cross-Origin-Opener-Policy: same-origin` leaves an opener no handle to post to. The preview also keeps
`localStorage` and `sessionStorage` in memory, from `toMemoryStorage` in `apps/web/src/nightshift/memoryStorage.ts`, so
a story never reads or changes a setting the user saved in the app. A separate origin with no session would isolate the
browser fully, which is an infrastructure change left to the owner.

**Indexing.** `/nightshift` is not indexed. It is a catalog of components with invented data, nothing a searcher
looks for, and each story would index as a thin page. Every response sends `X-Robots-Tag: noindex`, and `robots.txt`
keeps allowing the path, so a crawler can read the header. The sitemap and the llms files are built from explicit
lists of pages, the static routes, the blog, the docs, the public Topics and their podcast episodes, and the releases,
so they leave `/nightshift` out already, and the image check in task 8.4 reads both to confirm it.

**Dev and the image.** `apps/web/vite.config.ts` proxies `/nightshift` to the api beside `/docs`, so the footer link
works on `:5173` once the Storybook is built, and `bun run dev:storybook` is the live view. The Dockerfile's build stage
runs `bun run build:storybook` after `build:docs`, and the runtime stage's existing `COPY` of `apps/web/dist` includes
the output, with a comment naming it. Storybook stays out of the runtime's production install.

### 10. The footer

`Footer.tsx`'s link row becomes What CarlNotes Is, Releases, Source Code, and Nightshift Design System, and License,
Privacy, and Terms move to a row of their own beneath it, both `flex flex-wrap justify-center gap-x-6 gap-y-1` as
today. The new link is an `AnchorLink` to `/nightshift/` with `target="_blank"` and `rel="noopener noreferrer"`, the
way `DocsLink` opens `/docs`. It is written inline in the footer, since the footer is its one caller. `AnchorLink`
gains `/nightshift` beside `/docs` among the paths the server answers, so the link renders a plain anchor instead of a
router link that would look for a route. The longest label fits on one line at 375 pixels wide with the existing gap,
so neither row breaks inside a label.

### 11. How the change proves itself

- **Computed styles.** Before the rename, the built web app runs on a side port, and a Playwright script saves every
  custom property on the document element, then adds the `dark` class and saves them again. After section 3, the same
  script runs, and both JSON files must be equal.
- **Client size.** The total bytes under `apps/web/dist/client` and the CSS file's bytes are recorded before and after
  section 3 and must be equal. After the email copies, the stories, and the footer, the sizes are recorded again here,
  and only the chunks this change edits on purpose may grow.

  Recorded at apply. Before: 27,029,641 bytes, with `index-SawjJRjN.css` at 95,761 and `NoteEditor-Cc91oetD.css` at
  256,414. After section 3: the same 27,029,641 bytes and both CSS files byte for byte the same, hashes included, and
  every one of the 1,164 custom properties equal in light and dark. After the whole change: 27,029,998 bytes, 357 more,
  with both CSS files still byte for byte the same, so no story class reached the app's CSS. The growth is the footer's
  new link, `/nightshift` in `AnchorLink`'s server paths, `BrandIcon`'s exported list, and the screen-reader text the
  accessibility fixes added to the components in section 8. The theme-color values stayed literals, so no palette
  reached the browser bundle.

  After the contrast fix in section 8: 27,031,831 bytes, 1,833 more. The main CSS file grows from 95,761 to 97,193 bytes
  with the `faint-underline` and `sentence-link` utilities, the scroll box focus ring, the badge's padding, and the open
  comment's bar, and the scripts grow by 401 bytes with `useScrollRegionTabStop` and the toast colors. `NoteEditor`'s
  CSS stays byte for byte the same. Of the 102 custom properties `tokens.css` declares, 91 hold the value they had
  before the change. The other 11 are the seven tokens section 8 moves, light and dark.
- **Contrast.** `packages/nightshift/contrast.test.ts` passes its 90 pairs, and the re-sweep in section 8 finds no
  violation outside the one listed.
- **Emails.** The render pairs in section 5.
- **The image.** The production image runs on the dev Doppler config, and the checks in task 8.4 run against it.
  Recorded at apply: `/nightshift` responds 301 to `/nightshift/`, which responds 200 with `no-cache`, the browser's
  own policy, and `noindex`. `assets/iframe-Bxj0o_bx.js` responds with the immutable header, and
  `sb-manager/runtime.js` and `manifests/components.json` with `no-cache` and no `CDN-Cache-Control`. A missing file
  responds 404, `/api/health` still sends `frame-ancestors 'none'`, and the sitemap and both llms files never name
  `/nightshift`. In Chrome, the manager renders the footer story inside its preview frame with no console error. The
  runtime's `node_modules` holds no Storybook package.
- **By hand.** Three scenarios were checked by hand at apply, with no automated test. A story switched to dark renders
  the Dark roast values, since the theme toggle adds the `dark` class. A Claude Code session lists the components
  through the MCP server. The footer's rows wrap on a 375-pixel-wide phone with no label broken.
- **The DRY pass.** At ship, a DRY pass moved repeated class lists, styles, test fixtures, and helpers into shared
  homes, such as `STANDALONE_LINK_CLASS` and `SECTION_LABEL_CLASS` in `styleClasses.ts`, the one `Avatar` behind
  `UserAvatar` and `TeamAvatar`, and the api's `apiPageStyle.ts`, with no change to the rendered app. The one visible
  change is the line height of the small print in the auth, topic invite, and team invite emails, in section 5.

## Risks / Trade-offs

- [The email palette changes color, mostly text turning warm] → Every value is mapped in section 5, with contrast
  measured, and the render pairs show each email before and after. The fills move by less than a visible step.
- [The contrast fix changes colors across the web app] → Each of the seven tokens moves by a small step, listed with its
  ratios in section 8, and a light subtable takes the page's color. The contrast test holds every text token at 4.5:1,
  and the re-sweep checks every story in both modes.
- [A faint underline marks links inside sentences, which changes how prose reads] → It stays at 40 percent opacity
  until hover, and links that stand alone keep their hover-only underline.
- [Figma's import may reject a token type or a unit] → The files follow the 1.0 format with single-value tokens and
  pixel dimensions. Importing both into a scratch Figma file is a manual step at apply, and a rejected type is narrowed
  and recorded here.
- [Storybook's MCP addon is a preview, and its API may change] → It is pinned with the rest of Storybook at 10.6.2,
  and nothing in the app reads it.
- [The MCP server responds only while `bun run dev:storybook` runs, so an agent session without it shows the server as
  down] → `apps/web/AGENTS.md` says to start it, and the built manifests at `/nightshift/manifests/components.json` work
  without it.
- [A class written only in a story could grow the production CSS] → The `@source not` lines, and the client-size check.
- [The Docker build stage takes longer] → `build:storybook` runs once per image, in the stage that already holds the dev
  dependencies. The runtime image grows by the static output alone.
- [`build:ui` may clear `apps/web/dist` and the Storybook with it] → In the Dockerfile `build:storybook` runs after
  `build:ui`. Locally the browser is rebuilt with one script.
- [`serve-pages-from-a-web-service` moves the page routes into a shared package] → If it is still open, task 6.5 adds
  `/nightshift` beside `/docs` in its design and its static-serving delta, so the web service serves both.

## Migration Plan

1. Capture the computed styles, the client size, and the renders (tasks 1.1 to 1.3).
2. Rename, then move the tokens into TypeScript, and prove the computed styles and the client size match.
3. Point the emails and the other copies at the source, and render again.
4. Add Storybook, the stories, and the pages, and sweep accessibility.
5. Serve `/nightshift`, link it from the footer, and build and run the production image.
6. Move the seven color tokens, fix the components the sweep failed, render the emails again, and sweep again.
7. Ship as one commit. Nothing changes in Northflank or Doppler. Rollback is reverting the commit, which restores the
   emails' old palette and the web app's old colors, and drops `/nightshift`.

## Open Questions

None. Both questions the proposal left open were decided before the apply:

- The accessibility checks do not gate every push. Storybook's Vitest runner would add a second test runner and a
  browser download to CI. The apply sweeps every story once, and section 8 lists what it finds.
- The hosted `/nightshift` serves no MCP endpoint. Agents use the local Storybook's MCP server, and the built
  Storybook serves its manifests alone.
