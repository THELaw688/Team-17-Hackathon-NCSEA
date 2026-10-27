#!/bin/sh
#
# Runs automatically when anyone's Claude Code session starts in this repo
# (wired up in .claude/settings.json as a SessionStart hook).
#
# Two jobs: get the latest work, and show what changed while we were away.
# Output lands in the session, so the AI starts with current context instead of
# whatever was true last time it ran.

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0

echo "=== Syncing with GitHub ==="

# --ff-only so we never auto-create a merge commit behind the user's back.
# If it can't fast-forward, that's a real situation a human should look at.
if git pull --ff-only --quiet 2>/dev/null; then
    echo "Up to date with origin."
else
    echo "NOTE: could not fast-forward. You have local commits, a conflict, or no"
    echo "network. Run 'git pull' yourself and look at what it says."
fi

echo ""
echo "=== Branch ==="
git rev-parse --abbrev-ref HEAD 2>/dev/null

if [ ! -f CHANGELOG.md ]; then
    exit 0
fi

echo ""
echo "=== In progress (do not duplicate this work) ==="
# Everything between the "In progress" heading and the next top-level heading.
sed -n '/^## In progress/,/^## Log/p' CHANGELOG.md \
    | sed '1d;$d' \
    | grep -v '^$' \
    | grep -v '^Add a line when' \
    | grep -v '^how we avoid'

echo ""
echo "=== Three most recent CHANGELOG entries ==="
echo "(full history in CHANGELOG.md - read it if anything below is unfamiliar)"
echo ""
# From the Log heading, print until we have seen the fourth "### " entry.
sed -n '/^## Log/,$p' CHANGELOG.md | awk '
    /^### / { count++ }
    count > 3 { exit }
    count > 0 { print }
'

echo ""
echo "=== Reminder ==="
echo "Add a CHANGELOG entry when you finish, in the same commit as your code."
