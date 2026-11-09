---
title: Topic and podcast visions
description: >-
  Every topic and every podcast episode has an image Carl draws from what it's about. Where the images show, how Carl
  draws them, and how a topic's editor draws a new one or uploads their own.
sidebar:
  order: 7
---

Every topic has an image, and so does every podcast episode. Carl draws a topic's image when the topic is saved, from
its name, its prompt, its tags, and a few of its latest findings once it has brewed. Each podcast episode draws its own
image when it publishes, from what the episode covers.

![The CarlNotes Documentation topic's header: a watercolor of kites over a beach beside the topic's name, its byline,
and its tags](../../../assets/screenshots/topic-image-header.png)

## Where the images show

- **The home page.** Its topic and podcast sections are cards with their images: Featured topics, Featured podcasts,
  New podcasts this week, and Your topics once you sign in. Press a podcast card's play button to listen without
  leaving the page.
- **The Topics page.** Every topic in the directory, with its image. **Topics** is in the user menu.
- **A topic's page and a podcast episode's page,** at the top beside the title.
- **A finding's note.** Click a finding and its note shows the topic it came from: the topic's image, its name, a play
  button for its latest podcast episode, and its byline.
- **Search results, share cards, and podcast covers.** A podcast app shows the episode's image under its title.

![Featured podcasts on the home page: four podcast episode cards, each with its image, its topic, and a play
button](../../../assets/screenshots/home-podcasts.png)

![A podcast episode's page: the episode's image of a paper boat on a river at dusk beside its title, description, and
byline](../../../assets/screenshots/podcast-episode-image.png)

![The Topic section of a finding's note: the CarlNotes Documentation image, its name, a play button, and Brewed by Notes
of Carl](../../../assets/screenshots/finding-topic-section.png)

## How the images are drawn

Carl writes a one- or two-sentence scene from the topic, never a summary of what the topic argues, and an image model
draws it. Every image follows the same house style, so the cards read as one family. The rules are fixed: no words or
letters, no real people, logos, or brand marks, and nothing graphic. The image carries the model's invisible SynthID
watermark, which marks it as AI-made.

If the image fails to render, the topic keeps its drawn cover until the next render finishes. Nothing about the topic
waits on the image.

## Edit an image

A topic's editor can change the topic's image and each of its podcast episodes' images. On a topic's page or a podcast
episode's page, hover over the image until a camera shows, and click it. **Edit topic image** or **Edit podcast image**
opens with the image, **Regenerate**, and **Upload**. On a phone, the camera shows in the image's corner, so tap the
image. The same image section is also in **Edit topic**, and in **Edit podcast**, which a podcast episode page's **⋮**
actions menu opens.

Each change saves on its own, and the page shows the new image once it is in place.

## Regenerate

Press **Regenerate** for a new scene in the house style, or type an image prompt first, like "a lighthouse in a storm,
oil painting". Carl still draws from the topic, adds what the prompt asks for, and uses the style it names in place of
the house style. A podcast episode's image is drawn from what the episode covers. An image prompt is checked for sexual,
violent, and hateful content before anything is drawn. The new image appears within about a minute and replaces the old
one everywhere, including the show cover for a topic's image.

![The Image section of Edit topic: the topic's image, the Image prompt field, and the Regenerate
button](../../../assets/screenshots/topic-image-editor.png)

Each plan has a monthly limit of regenerations, shared by a topic's image and its podcast episodes' images, shown beside
the Upload button as "X of Y used this month". The button is gone once the month's limit is reached, and returns on the
1st. The limits are on the [plans page](/docs/account/plans-and-limits/).

## Upload

Press **Upload**, or the image itself, and pick a photo. A large photo, or an iPhone's HEIC, is shrunk and converted
before it uploads. The image is cropped to 3:2
from its center, its metadata is stripped, and it is checked for sexual, violent, and hateful content before it
replaces the drawn image. **Remove** takes an upload away and
draws a fresh image in its place, which counts as one of the month's regenerations.

## Private topics

A private or invite topic's image is served only to the people who can open the topic. A public topic's image is
cached at the edge like its page.

## Reporting an image

Anyone who can open a topic can report its image from the topic's share menu with **Report image**. An admin who
agrees draws a new one.
