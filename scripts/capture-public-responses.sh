#!/usr/bin/env bash
# capture the public responses that a structure change must leave unchanged, one file each, so two captures diff.
# usage: bash scripts/capture-public-responses.sh <dir>   (CAPTURE_ORIGIN names the server, http://localhost:3000 by default)
set -euo pipefail

# the directory the captures go to, and the server they come from
capture_dir="${1:?usage: capture-public-responses.sh <dir>}"
origin="${CAPTURE_ORIGIN:-http://localhost:3000}"
mkdir -p "$capture_dir"

# fetch one path into a file named after it: the status line first, then the body with hashed asset names, the request
# nonce, the router's load times, and the security file's expiry replaced. a binary body is kept as is
capture() {
  local path="$1" name="$2" is_binary="${3:-}"
  local body_file="$capture_dir/$name"
  local status
  status=$(curl -s -m 30 -o "$body_file.raw" -w '%{http_code} %{content_type}' "$origin$path")
  echo "GET $path -> $status"
  if [[ -n "$is_binary" ]]; then
    { echo "$status"; cat "$body_file.raw"; } > "$body_file"
  else
    { echo "$status"; sed -E -e 's#(/assets/[A-Za-z0-9_.-]+)-[A-Za-z0-9_-]{8,}\.#\1-HASH.#g' -e 's#nonce="[^"]*"#nonce="NONCE"#g' -e 's#u:[0-9]{13}#u:TIME#g' -e 's#^Expires: .*#Expires: EXPIRES#' "$body_file.raw"; } > "$body_file"
  fi
  rm -f "$body_file.raw"
}

# the documents the api builds per request
capture /sitemap.xml sitemap.xml
capture /robots.txt robots.txt
capture /llms.txt llms.txt
capture /llms-full.txt llms-full.txt
capture /feed.xml feed.xml
capture /indexnow.txt indexnow.txt
capture /.well-known/security.txt security.txt

# the first public topic in the sitemap whose podcast feed answers, else the first public topic. a topic page's path has
# the id and the slug alone, so a podcast episode page after a topic path is skipped
topic_paths=$(sed -n 's#.*<loc>[^<]*\(/topics/[^/<]*/[^/<]*\)</loc>.*#\1#p' "$capture_dir/sitemap.xml")
topic_path=$(echo "$topic_paths" | head -1)
if [[ -z "$topic_path" ]]; then
  echo "capture: the sitemap lists no public topic" >&2
  exit 1
fi
for candidate_path in $topic_paths; do
  candidate_id=$(echo "$candidate_path" | cut -d/ -f3)
  if [[ "$(curl -s -m 30 -o /dev/null -w '%{http_code}' "$origin/topics/$candidate_id/podcast.xml")" == "200" ]]; then
    topic_path="$candidate_path"
    break
  fi
done
topic_id=$(echo "$topic_path" | cut -d/ -f3)
podcast_feed_path="/topics/$topic_id/podcast.xml"
echo "topic: $topic_path"

# the topic's server-rendered page, its podcast feed, its preview image, and its show cover from the feed
capture "$topic_path" topic-page.html
capture "$podcast_feed_path" topic-podcast.xml
capture "/api/topics/$topic_id/preview.png" topic-preview.png binary
cover_path=$(sed -n 's#.*<itunes:image href="[^"]*\(/api/podcast-covers/[^"]*\)".*#\1#p' "$capture_dir/topic-podcast.xml" | head -1)
if [[ -n "$cover_path" ]]; then
  capture "$cover_path" podcast-cover.jpg binary
else
  echo "no podcast cover: the topic's podcast feed names no cover" | tee "$capture_dir/podcast-cover.jpg"
fi
echo "captured into $capture_dir"
