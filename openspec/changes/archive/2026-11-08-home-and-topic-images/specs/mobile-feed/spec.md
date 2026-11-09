# Spec Delta

## ADDED Requirements

### Requirement: The Home tab is the signed-in face and the Topics tab is the directory

The app's Home tab SHALL show a signed-in user the featured cards and their Topics as cards, with the shared cards, and
SHALL show a visitor the web's visitor face at phone width: the hero, the headline, how it works, and the featured
cards. A Topics tab SHALL show the
directory the Home tab showed before this change, with each row's image at the web row's phone width. The topic screen
SHALL show the `page` image where the web's header shows it, and search results SHALL show the image. Every image loads
its 2x file.

#### Scenario: A user's Home shows cards

- **WHEN** a signed-in user opens the Home tab
- **THEN** they see the featured Topic and Podcast Episode cards and their own Topics as cards

#### Scenario: The directory moved to its tab

- **WHEN** a user opens the Topics tab
- **THEN** they see the sections the Home tab showed before, each row with its image

### Requirement: The editor regenerates and uploads from the photo library

The mobile topic editor SHALL show the Topic's image with Regenerate and Upload, the latter and a press on the
image from the photo library, with the same count, the same absent control at the limit, and the server's center crop.

#### Scenario: An owner uploads a photo

- **WHEN** an owner picks a tall photo from the library
- **THEN** the stored image is the center 3:2 of it and the editor shows it

## MODIFIED Requirements

### Requirement: Home shows the existing Feed sections

The Topics tab SHALL read the same API as web and show Yours, Subscribed, Featured, and Popular using the web's section
labels and delivered Topic order. Each Topic SHALL show its name, unread count, and delivered Findings under the shared
sort. The list SHALL support variable card heights and long feeds without rendering every Finding at once.

#### Scenario: A Topic heading matches the web

- **WHEN** a Topic has attribution, tags, and unread Findings
- **THEN** its linked title sits above the team-or-owner "Brewed by" link and plain "N new" text with a separate share
  icon, followed by secondary tag badges; section counts include "topic" or "topics"

#### Scenario: A user opens a byline or shares a Topic

- **WHEN** the user presses a team or username byline or the share icon
- **THEN** the byline opens the native Team or Profile page, or the share icon opens the Topic sharing options; native
  Share is one option, and private Topics retain their access restrictions

#### Scenario: A user opens Home

- **WHEN** the Feed loads for a signed-in user on the Topics tab
- **THEN** the tab shows the delivered sections, Topics, and Findings with the requesting user's read and bookmark state

#### Scenario: The initial section follows the web

- **WHEN** a user owns no Topics and follows at least one
- **THEN** Subscribed opens first; a user who owns Topics initially sees Yours open

#### Scenario: A long Feed scrolls

- **WHEN** a user scrolls a Feed with many variable-height cards
- **THEN** offscreen Finding cards are recycled without carrying another Topic's control state or Finding image
