#!/bin/bash
# Creates a new task file with the next available number.
# Usage: tasks/new.sh "short-slug" ["Task title for heading"]
# Example: tasks/new.sh "rossignol-scraper" "Add Rossignol manufacturer scraper"

set -e

if [ -z "$1" ]; then
  echo "Usage: tasks/new.sh <slug> [title]" >&2
  exit 1
fi

SLUG="$1"
TITLE="${2:-$SLUG}"

# Find highest existing task number across both directories
NEXT=$(ls tasks/todo/ tasks/done/ 2>/dev/null | grep -oE '^[0-9]+' | sort -n | tail -1)
NEXT=$(( ${NEXT:-0} + 1 ))

FILE="tasks/todo/${NEXT}-${SLUG}.md"
echo "# Task ${NEXT}: ${TITLE}" > "$FILE"
echo "" >> "$FILE"
echo "Created: $FILE"
