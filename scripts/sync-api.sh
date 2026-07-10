#!/usr/bin/env bash
# Copies the Convex generated API from the main repo (curiosity-learning-frontend-svelte) into
# this repo's src/convex-api/. This admin app has no Convex backend of its own — it is a pure
# client of the shared Convex deployment, whose functions (admin.ts, moderation.ts, auth.ts,
# schema, etc.) live in the main repo only.
#
# Re-run this after any backend change in the main repo (new/changed queries, mutations, or
# schema) so this app's `api`/`Id` types stay in sync. This does NOT deploy anything — it only
# copies already-generated TypeScript types/bindings.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MAIN_REPO="$(cd "$REPO_ROOT/../curiosity-learning-frontend-svelte" && pwd)"
SOURCE_DIR="$MAIN_REPO/src/convex/_generated"
DEST_DIR="$REPO_ROOT/src/convex-api"

if [ ! -d "$SOURCE_DIR" ]; then
	echo "error: $SOURCE_DIR not found." >&2
	echo "Expected the main repo at $MAIN_REPO with Convex codegen already run" >&2
	echo "(run 'npm run convex:codegen' or 'npx convex dev' there first)." >&2
	exit 1
fi

rm -rf "$DEST_DIR"
mkdir -p "$DEST_DIR"
cp -R "$SOURCE_DIR" "$DEST_DIR/_generated"

echo "Synced Convex generated API from:"
echo "  $SOURCE_DIR"
echo "into:"
echo "  $DEST_DIR/_generated"
