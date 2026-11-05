#!/usr/bin/env bash
# Vercel "Ignored Build Step" (vercel.json ignoreCommand). Exit 0 skips the build, 1 builds.
# Skips when nothing but the Team Builder snapshot, scripts, tests or workflows changed since
# the last successful deployment: the page reads that data from Supabase Storage, and the rest
# never reaches the site, so a redeploy would only cost ISR writes and reset every cached page.

prev="$VERCEL_GIT_PREVIOUS_SHA"
# First deploy of a branch, or the last deployed commit isn't in Vercel's shallow clone: build.
if [ -z "$prev" ] || ! git cat-file -e "${prev}^{commit}" 2>/dev/null; then
  exit 1
fi

if git diff --quiet "$prev" HEAD -- . ':(exclude)public/data/team-builder' ':(exclude)scripts' ':(exclude)tests' ':(exclude).github'; then
  echo "Only Team Builder data, scripts, tests or workflows changed since $prev; skipping the build."
  exit 0
fi
exit 1
