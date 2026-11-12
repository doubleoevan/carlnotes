# specials-dashboards Specification

## Purpose
The Dashboard pages give a person and a team one public dashboard of their audience: who opened their topics,
findings, and posts, who played their podcast episodes and films, over time and by place, on web, mobile, and MCP.
Copy calls the pages Specials.

## Requirements

### Requirement: Three Dashboard pages share one dashboard component

The app SHALL offer Topic Dashboard across a person's topics at `/profiles/<userId>/specials/topics`, Podcast
Dashboard across a person's podcasts at `/profiles/<userId>/specials/podcasts`, and Team Dashboard across a team's
topics at `/teams/<teamId>/specials`, on the web and in the mobile app, named "Topic Specials", "Podcast Specials",
and "Team Specials". All three SHALL render one shared dashboard component with the same summary strip, paragraph,
and five chart sections.

#### Scenario: A person's Topic Dashboard opens

- **WHEN** a visitor opens `/profiles/u1/specials/topics` for a person with public topics
- **THEN** the page shows that person's Topic Dashboard with its summary strip, Carl's paragraph, and five chart
  sections

#### Scenario: A team's Team Dashboard opens

- **WHEN** a team member opens `/teams/t1/specials`
- **THEN** the page shows Team Dashboard across the topics team t1 owns

### Requirement: The page header copies the Activity page

Each Dashboard page SHALL use the Activity page's page layout: a header row with its menu row's icon and the page
heading, "Topic Daily Specials", "Podcast Daily Specials", or "Team Daily Specials", on the left, and under it the
subject header with the person's or team's avatar, name, and summary strip.

#### Scenario: The header names the page beside its icon

- **WHEN** a reader opens a person's Podcast Dashboard
- **THEN** the header reads "Podcast Daily Specials" beside its menu row's icon, with the person's avatar and name
  under it

### Requirement: Team Dashboard picks its team from a dropdown

Team Dashboard SHALL show a team dropdown in place of the team's name in its subject header for a signed-in reader who
belongs to at least one team. It SHALL list the reader's teams and the current team, each with its avatar, in
alphabetical order, ignoring case, with the current team selected. Choosing a team SHALL open that team's Team
Dashboard.

#### Scenario: Teams list alphabetically

- **WHEN** a member of the teams Zeta, alpha, and Mid opens Team Dashboard
- **THEN** the dropdown lists alpha, Mid, Zeta

#### Scenario: Choosing a team opens its page

- **WHEN** the reader chooses Mid in the dropdown
- **THEN** the page becomes Mid's Team Dashboard

#### Scenario: A signed-out reader sees no dropdown

- **WHEN** a visitor who is not signed in opens a public team's Team Dashboard
- **THEN** the header shows the team's name and no team dropdown

### Requirement: Chart sections sit in four rows of expandable cards

Below the summary strip and the paragraph, each page SHALL show five expandable sections, each holding its chart in a
card: the bar chart on the first row, the pie chart and the word cloud side by side on the second, the trend on the
third, and the map on the fourth. The sections SHALL be titled Popular 🔥, Slices, Poetry, Performance, and
Visitors, in that order. All SHALL start open. Below 48rem wide, the pie and the word cloud SHALL stack.

#### Scenario: Pie and word cloud share a row

- **WHEN** a Dashboard page is open 1024 pixels wide
- **THEN** the pie section and the word cloud section sit side by side between the bar section and the trend section

#### Scenario: A phone stacks every section

- **WHEN** a Dashboard page is open 375 pixels wide
- **THEN** the five sections stack in the order bar, pie, word cloud, trend, map, with no sideways scroll

### Requirement: Topic and Team charts switch between Findings, Topics, and Posts

Every Topic Dashboard and Team Dashboard chart SHALL have its own dropdown of Findings, Topics, and Posts, starting on
Topics. Each chart SHALL count visitors to each item of the chosen kind. Every page SHALL open on the default choices,
so a choice made on one page never applies to another.

#### Scenario: One chart's choice leaves the others alone

- **WHEN** a reader switches the bar chart to Findings
- **THEN** the bar chart redraws for findings and the pie, word cloud, trend, and map keep Topics

#### Scenario: Another page starts on the defaults

- **WHEN** the reader switches the trend to Posts and then opens another person's Topic Dashboard
- **THEN** that page's trend opens on Topics

### Requirement: Podcast charts switch between Podcasts, Films, and Both

Every Podcast Dashboard chart SHALL have its own radio group of Podcasts, Films, and Both, starting on Both on every
page. Films SHALL count film plays, Podcasts the plays that were not film plays, and Both all plays, each by podcast
episode, finished or not.

#### Scenario: Each format counts its own plays

- **WHEN** a podcast episode had three audio plays and two film plays in the range
- **THEN** its bar reads 3 under Podcasts, 2 under Films, and 5 under Both

### Requirement: The bar chart ranks the top ten

The bar chart SHALL show the ten items, or podcast episodes, with the most visitors, or plays, in the last 365
completed days, most first, each with its count at its end. Film plays SHALL take the second series color under Films
as they do under Both. On the web, pressing a bar SHALL open that item's page. In the app, a tap on a bar SHALL open
the item's sheet, whose button opens the item's page.

#### Scenario: A bar opens its finding

- **WHEN** a reader presses the bar of a finding on Topic Dashboard on the web
- **THEN** the finding's page opens

#### Scenario: A tap on a bar opens its sheet in the app

- **WHEN** a reader taps the bar of a finding on Topic Dashboard in the mobile app
- **THEN** a bottom sheet shows the finding's count and a button that opens the finding's page

### Requirement: The pie and the trend show every topic, post, and podcast episode

With Topics, Posts, or any Podcast Dashboard format, the pie and the trend SHALL show every item. Neither SHALL have a
legend, so the pie's card is as tall as the word cloud's. With Findings, they SHALL show the top ten findings and fold
the rest into one Other slice or line.

#### Scenario: Findings fold into Other

- **WHEN** the pie is set to Findings for a person with 40 visited findings
- **THEN** the pie shows ten finding slices and one Other slice holding the remaining 30

### Requirement: The trend's tooltip lists the day

On the web, a hover on the trend SHALL show the day's tooltip: the day, then each line with a count that day, most
first, with its color and count, and the day's total at the bottom right. The line nearest the pointer SHALL be
highlighted on the chart and in bold in its color in the tooltip, the other rows in the text color.

#### Scenario: The nearest line is bold

- **WHEN** the pointer sits nearest one topic's line on a day
- **THEN** that line is highlighted on the chart and its row in the tooltip is bold in its color

### Requirement: A click on the trend pins its day

On the web, a click on the trend SHALL pin that day's detail over the chart until it is closed, with the same rows and
total as the tooltip, and each line in it but Other SHALL open its page. In the app, a tap SHALL open the day's sheet
with the same lines and total. A long list of lines SHALL scroll in the scroll box the app uses for a long note, on the
pinned day, the map's open place, and the app's sheet.

#### Scenario: A pinned day opens a topic

- **WHEN** a reader clicks the trend on Nov 9 and then a topic's line in the pinned detail
- **THEN** that topic's page opens

### Requirement: The trend has a preset range

The trend SHALL show visitors, or plays, per completed UTC day, one line per item with a count in the range, over a
range the reader chooses from 7, 30, 90, and 365 days, starting on 30 on every page. The 365-day range SHALL show a
point per week instead: 52 whole weeks, the last ending on the last completed day, each point summing its seven days
and its tooltip titled with the week's first day.

#### Scenario: A longer range redraws the trend

- **WHEN** the reader chooses 90 days
- **THEN** the trend shows the 90 completed days before today

#### Scenario: The year shows weeks

- **WHEN** the reader chooses 365 days and hovers the last point
- **THEN** the trend shows 52 weekly points, and the tooltip reads "Week of" the last week's first day with the week's
  total

### Requirement: The word cloud sizes title words by their audience

The word cloud SHALL show words from the chosen items' titles, sized by the visits or plays of the items whose titles
hold them, leaving out common short words, at most 60 words. On the web, the words SHALL spread out from the middle as
the cloud draws, unless the reader asks for reduced motion. The app SHALL draw them in their places at once.

#### Scenario: Common short words stay out

- **WHEN** the chosen items' titles hold "the" and "solar"
- **THEN** the cloud shows "solar" and leaves out "the"

### Requirement: A word's detail counts times

Hovering a word on the web SHALL show its count in a tooltip, never cut off by the cloud's edge. In the app, a tap on a
word SHALL open its sheet with the same count. The count SHALL read as times on every page. One visitor may read many
of the items, so a word's count is not a count of visitors. Under Both on Podcast Dashboard, the count SHALL split into
podcast and film over its total times.

#### Scenario: A word's detail gives its count

- **WHEN** a reader focuses the word "solar" on Topic Dashboard
- **THEN** its tooltip or sheet gives the summed visitors of the items whose titles hold "solar" as times, such as 93
  times

### Requirement: The map pins visitors by place

The map SHALL pin each shown city at its place and each country's remainder at its country's center, under the city
minimum of the daily view and play counts. Places that sit near each other on the screen SHALL share one pin. Every pin
shows its items' visits or plays summed, the same number its detail totals. A pin SHALL show no tooltip on hover, so it
never covers the pins around it.

#### Scenario: Zooming in splits a country's pin into its cities

- **WHEN** a reader zooms the map in on a country with two shown cities
- **THEN** the country's shared pin gives way to the two city pins and a pin for the country's remainder

### Requirement: A click on a map pin zooms in or opens its detail

A click on a shared pin SHALL zoom the map to its places. A click on a pin of one place SHALL open its detail, which
stays open until the reader closes it and lists the 20 items visited, or podcast episodes played, most there, most
first, each title opening its page with how many times beside it, and every visit or play there summed as the total
at the bottom right, in the items' unit.

#### Scenario: A click on a shared pin zooms to its places

- **WHEN** a reader clicks a pin that shows 15 for Paris and the rest of France
- **THEN** the map zooms to Paris and France's center, where each has its own pin with its own count

#### Scenario: A click on one place opens its detail

- **WHEN** a reader clicks the Paris pin
- **THEN** its detail stays open over the map and lists the items visited from Paris and how many times
- **AND** a click on an item there opens that item's page

### Requirement: Podcast tooltips leave the kind to the selector

A Podcast Dashboard row SHALL leave out the kind of play its selector names: under Podcasts or Films it SHALL read its
plays, and under Both it SHALL split them into podcast and film. Under Both, a bar's or a slice's total SHALL read its
plays, and a sum of rows, the trend day's or a place's, SHALL read its podcast plays and film plays.

#### Scenario: Both splits the count

- **WHEN** a reader focuses a bar under Both for a podcast episode with 3 audio and 2 film plays
- **THEN** the tooltip reads 3 podcast and 2 film, with 5 plays at its bottom right

#### Scenario: A pinned day under Both totals each kind

- **WHEN** a reader pins a day under Both whose lines hold 10 audio and 4 film plays
- **THEN** each row reads its podcast and film plays, such as 6 podcast · 0 film, and the total reads 10 podcast plays
  · 4 film plays

### Requirement: Tooltips hover on the web and open a sheet on mobile

A chart point's details SHALL show on hover on the web and in a bottom sheet on a tap in the mobile app, with the
item's link as a button in the sheet. Both SHALL show the same counts and words.

#### Scenario: A tap opens the sheet

- **WHEN** a reader taps a pie slice in the mobile app
- **THEN** a bottom sheet shows the slice's item, its count, and a button that opens the item

### Requirement: A topic's podcast episode opens at its player

On Podcast Dashboard, an item for a topic's podcast episode without its own page SHALL open its topic page at the film
for film plays and at the podcast episode player for podcast plays. Under Both it SHALL open at the format with more
plays, the podcast player on a tie. In the app it SHALL open the topic's screen.

#### Scenario: A film opens at the topic's film

- **WHEN** a reader clicks a topic's podcast episode under Films
- **THEN** its topic page opens scrolled to the film

### Requirement: A cut-off title shows in full on hover

On the web, every Dashboard page SHALL show a title cut off with an ellipsis in full in the app's tooltip on hover: a
bar's label, a pinned trend day's line, and an item in the map's open place. A title that fits SHALL show no tooltip.

#### Scenario: A long bar label shows in full

- **WHEN** a reader hovers a bar label cut off with an ellipsis
- **THEN** the tooltip shows the whole title

### Requirement: The summary strip sits in the header and Carl's paragraph in the Popular card

Each page's header SHALL hold the summary strip under its person's or team's name. Carl's paragraph SHALL sit in the
bar chart's card, titled Popular, under the card's controls and above the chart, whichever item kind or format the card
shows. The strip SHALL read topics, findings, posts, and visitors for Topic Dashboard; podcasts, podcast episodes,
podcast plays, and film plays for Podcast Dashboard; topics, findings, posts, members, and visitors for Team Dashboard.

#### Scenario: The paragraph opens the Popular card

- **WHEN** a reader opens a Dashboard that has Carl's paragraph
- **THEN** the paragraph shows in the Popular card between its select and its bars

#### Scenario: Podcast Dashboard counts both formats

- **WHEN** a reader opens Podcast Dashboard
- **THEN** the strip reads its podcasts, podcast episodes, podcast plays, and film plays

#### Scenario: Team Dashboard counts its visitors

- **WHEN** a reader opens Team Dashboard
- **THEN** the strip reads its topics, findings, posts, members, and visitors

### Requirement: The header lays out its person or team like the profile page

Each page's header SHALL lay out its person or team like the profile page, with the same spacing: the avatar at the
profile page's size, then the name in the display font over the summary strip. The avatar and the name SHALL each open
the person's profile page or the team's page.

#### Scenario: The name opens the profile page

- **WHEN** a reader presses the person's name in a Topic Dashboard header
- **THEN** that person's profile page opens

### Requirement: The web's summary strip flows around the avatar

On the web, the summary strip SHALL flow around the avatar. Each count that no longer fits beside it SHALL wrap to the
next line whole, and the lines past the avatar SHALL continue under it.

#### Scenario: Counts wrap one at a time around the avatar

- **WHEN** a header's counts on the web are wider than the space beside the avatar
- **THEN** each count that no longer fits moves to the next line whole, and the lines past the avatar run under it

### Requirement: The app's header column drops below the avatar at a large text size

In the app, the name and the summary strip SHALL sit in a column beside the avatar. The whole column SHALL drop below
the avatar at a large text size.

#### Scenario: The app's column drops below the avatar

- **WHEN** the app's text size leaves the column beside the avatar narrower than its minimum width
- **THEN** the name and the summary strip sit below the avatar

### Requirement: Carl writes the paragraph from numbers alone

Carl's paragraph SHALL be written once a day after the daily counts close, in Carl's voice, from the dashboard's numbers
alone. No title, comment, or other user text SHALL reach the model. An unchanged dashboard SHALL keep its paragraph.

#### Scenario: A title never reaches the model

- **WHEN** the nightly run writes a paragraph for a person whose topic title holds an instruction
- **THEN** the model's input holds counts and kinds and no topic title

### Requirement: The owner sees everything they own and others see public items

The owner SHALL see their own Dashboard pages across every item they own, private ones included. A team's active members
SHALL see Team Dashboard across every topic the team owns, except a private topic whose legacy Personal sources text is
not converted yet, which members may not open. Everyone else SHALL see public topics, findings, posts, podcasts, podcast
episodes, and films only. A private item SHALL contribute nothing to what they see.

#### Scenario: A private topic is left out for others

- **WHEN** a visitor opens the Topic Dashboard of a person with one public and one private topic
- **THEN** every chart and the strip count only the public topic

#### Scenario: The owner sees the private topic

- **WHEN** that person opens their own Topic Dashboard
- **THEN** the charts and the strip count both topics

### Requirement: Non-members see only the Team summary strip

On Team Dashboard, a reader who is not an active member SHALL see the summary strip alone, with no paragraph and no
chart sections. The dashboard route SHALL return the same, never the series.

#### Scenario: The route withholds a team's series

- **WHEN** a non-member requests a team's dashboard data
- **THEN** the response holds the summary strip and no chart series

### Requirement: The strip and paragraph render on the server

The header, the summary strip, and Carl's paragraph SHALL be in a Dashboard page's server-rendered HTML, from the
public dashboard, with a share image in the page head. Team Dashboard's public read is its summary strip alone, so a
team's HTML SHALL hold no paragraph and its head SHALL keep the team's own image. The charts SHALL load after
hydration, and the chart code SHALL load only on Dashboard pages.

#### Scenario: A crawler reads the paragraph

- **WHEN** a crawler fetches a person's Topic Dashboard
- **THEN** the HTML holds the summary strip, Carl's paragraph, and an og:image for the share image

#### Scenario: A team's page renders its strip alone

- **WHEN** a crawler fetches a team's Team Dashboard
- **THEN** the HTML and the description hold the summary strip and no paragraph, and the og:image is the team's own

#### Scenario: Other pages load no chart code

- **WHEN** a visitor opens a topic page
- **THEN** no chart library code is requested

### Requirement: Dashboard data comes from a nightly snapshot

The charts SHALL read data built nightly, never computed on request. The public data SHALL be cached at the edge per
dashboard, subject, item kind or format, and day, and purged after the nightly build. Data that includes private items
SHALL never be cached. Reads SHALL be rate limited at 120 reads a minute per user or address.

#### Scenario: A privacy change takes effect at once

- **WHEN** an owner makes a public topic private
- **THEN** the person's public dashboard no longer counts it on the next read, without waiting for the nightly build

### Requirement: The share image is drawn nightly

One chart SHALL be drawn as each public dashboard's share image during the nightly build, never on request, and the
page's action menu SHALL offer Share with the page's url.

#### Scenario: Share opens the page's share flow

- **WHEN** a reader chooses Share in a Dashboard page's action menu
- **THEN** the app's share flow opens with that page's url

### Requirement: The user menu has a Dashboard section

The user menu SHALL hold one section, set off by dividers, with three rows that look like the other rows, each with
its icon left of its text: "Topic Specials", "Podcast Specials", and "Team Specials". The Topic and Podcast rows SHALL
open the user's own pages. The Team row SHALL open the user's first team's Team Dashboard in alphabetical order, or the
Teams page for a user with no team. The mobile account screen SHALL have the same three rows.

#### Scenario: The menu shows three Dashboard rows

- **WHEN** a signed-in user opens the user menu
- **THEN** a section shows exactly "Topic Specials", "Podcast Specials", and "Team Specials", each with its icon at the
  left

#### Scenario: The Team row opens the first team

- **WHEN** a member of the teams Mid and alpha chooses "Team Specials"
- **THEN** alpha's Team Dashboard opens

### Requirement: Profile pages and team pages link to their Dashboard pages

A person's profile page SHALL link to their Topic Dashboard and Podcast Dashboard, and a team page SHALL link to its
Team Dashboard, on the web and in the mobile app.

#### Scenario: A profile page links to Podcast Dashboard

- **WHEN** a visitor opens a person's profile page
- **THEN** a link opens that person's Podcast Dashboard

### Requirement: The topic scan email links Topic Dashboard once a month

The first topic scan email a user receives in each UTC month SHALL have one line linking to their Topic Dashboard.
Later topic scan emails that month SHALL not have it.

#### Scenario: The second topic scan email of the month has no line

- **WHEN** a user receives a second topic scan email in November
- **THEN** that topic scan email holds no Topic Dashboard line

### Requirement: The UI holds no notices

The Dashboard pages SHALL show no notice, warning, or explanation beyond chart titles, control labels, and tooltips.
An empty chart SHALL show its empty card at the chart's height with its line in the middle in larger text, and an
empty map SHALL show the map with no pins.

#### Scenario: A self-hosted map stays empty

- **WHEN** a Dashboard page opens on a deployment with no place data
- **THEN** the map section shows a map with no pins and no message

### Requirement: Chart titles render as plain text

Titles of topics, findings, posts, and podcast episodes in charts and tooltips SHALL render as sanitized plain text.

#### Scenario: Markup in a title stays text

- **WHEN** a topic's title holds `<b>bold</b>`
- **THEN** its row in the trend's tooltip reads the characters `<b>bold</b>` with no bold text

### Requirement: An MCP tool reads a dashboard

The MCP server SHALL offer a read-only dashboard tool that returns the summary strip, Carl's paragraph, its day, and
the page's url for a person's topics, a person's podcasts, or a team, defaulting to the caller, under the same access
rules. Its view SHALL render the shared dashboard and SHALL link to the caller's three Dashboard pages.

#### Scenario: Claude reads a month of podcasts

- **WHEN** a signed-in caller asks the tool for their podcasts
- **THEN** it returns their Podcast Dashboard strip, Carl's paragraph, and the page url

#### Scenario: A non-member reads a team's strip only

- **WHEN** a caller who is not a member asks for a team's dashboard
- **THEN** the tool returns the summary strip and no paragraph

### Requirement: Dashboard use is tracked by ID

The apps SHALL send PostHog events with IDs only, never a title. A dashboard view SHALL send `social_dashboard_view`
with the dashboard kind, the subject's ID, and whether the reader owns the subject. The person owns their own pages,
and a team's leader owns Team Dashboard.

#### Scenario: A view sends IDs

- **WHEN** a person opens their own Topic Dashboard
- **THEN** one view event is sent with the dashboard kind, their ID as the subject ID, and that they own the subject,
  and no title

### Requirement: A chart control change is tracked

An item kind change, a format change, and a range change SHALL send `social_dashboard_item_kind_change`,
`social_dashboard_format_change`, and `social_dashboard_range_change` with the view event's three properties, the
chart, and the new selection or range.

#### Scenario: A range change sends IDs

- **WHEN** a reader sets the trend's range to 90 days
- **THEN** one range change event is sent with the dashboard kind, the subject ID, whether the reader owns the subject,
  the chart, and the range, and no title

### Requirement: A share is tracked by its channel

A share SHALL send `social_dashboard_share` with the dashboard kind, the subject's ID, and the share's channel, on the
web and in the app.

#### Scenario: A share in the app sends its channel

- **WHEN** a reader chooses Share on a Dashboard screen in the mobile app
- **THEN** one share event is sent with the dashboard kind, the subject ID, and the share sheet's channel
