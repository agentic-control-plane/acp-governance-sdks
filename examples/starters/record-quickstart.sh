#!/usr/bin/env bash
set -euo pipefail

# "Governance in three minutes" — the terminal half, for any starter.
#
#   ./record-quickstart.sh crewai
#   ./record-quickstart.sh langgraph [outname]
#
# Records a REAL install of the PUBLISHED packages into a fresh venv, the two
# decorators that do the work, and a real agent run. Nothing mocked, nothing
# edited — same rule as the ACP terminal rig. If a take goes wrong, re-record.
#
# Deliberately does NOT use a starter's own venv or pyproject: every starter
# resolves its acp-* package from a local editable path, and a viewer typing
# `pip install acp-langchain` gets the PyPI build. Recording the local path
# would make the install line quietly false.
#
# .env is copied in BEFORE recording and never displayed.
#
# ── Hard-won await rules (three takes died on these; don't undo them) ──
#   1. Never await a pattern that appears in the command you just typed —
#      the shell echoes it and the await matches instantly.
#   2. Never await text that could still be on screen from an earlier beat.
#      `clear` before a beat whose output you need to match.
#   3. Never await LLM prose. The agent's answer rephrases every run ("contains
#      the note" one take, "contains a placeholder status" the next). Match a
#      deterministic token — here, the record id.

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STARTER="${1:-}"
[ -n "$STARTER" ] || { echo "usage: $0 <crewai|langgraph> [outname]" >&2; exit 1; }
SRC="$HERE/$STARTER"
[ -d "$SRC" ] || { echo "no such starter: $SRC" >&2; exit 1; }

# ── per-starter config ────────────────────────────────────────────────
# DECOR/CTX are line ranges into that starter's starter.py. If you edit a
# starter, re-check these — a wrong range silently films the wrong lines.
case "$STARTER" in
  crewai)
    PKGS="acp-crewai crewai python-dotenv"
    LISTGREP='^(acp-crewai|crewai) '
    DECOR="44,53"; CTX="56,63"
    SEED_CREWAI=1 ;;
  langgraph)
    PKGS="acp-langchain langchain langgraph langchain-openai python-dotenv"
    LISTGREP='^(acp-langchain|langchain|langgraph) '
    DECOR="40,48"; CTX="52,58"
    SEED_CREWAI=0 ;;
  *) echo "unknown starter: $STARTER (add a config block)" >&2; exit 1 ;;
esac

OUT="${2:-acp-$STARTER-quickstart}"
WORK="${TMPDIR:-/tmp}/acp-$STARTER-take"
SESSION="qsdemo"
COLS=100; ROWS=28
CAST="$SRC/$OUT.cast"; GIF="$SRC/$OUT.gif"; MP4="$SRC/$OUT.mp4"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

for c in tmux asciinema agg ffmpeg uv; do command -v "$c" >/dev/null || die "missing: $c"; done
[ -f "$SRC/.env" ] || die "no .env in $SRC"

say "Building a clean workspace at $WORK"
rm -rf "$WORK"; mkdir -p "$WORK"
cp "$SRC/starter.py" "$WORK/starter.py"
cp "$SRC/.env" "$WORK/.env"; chmod 600 "$WORK/.env"

say "Warming the package cache (off camera)…"
( cd "$WORK" && uv venv --quiet && uv pip install --quiet $PKGS ) >/dev/null 2>&1 || true
rm -rf "$WORK/.venv"

# CrewAI asks "Would you like to view your execution traces?" after a
# successful run and saves the answer on timeout — landing AFTER the result, so
# the clip would end on CrewAI's upsell and burn 20s. CREWAI_TRACING_ENABLED
# does NOT suppress it (verified); the prompt is gated on this consent file.
# Seeding it is the same choice the timeout makes, taken off camera.
if [ "$SEED_CREWAI" = "1" ]; then
  SEED_DIR="$WORK/Library/Application Support/$(basename "$WORK")"
  mkdir -p "$SEED_DIR"
  printf '{\n  "first_execution_done": true,\n  "trace_consent": false\n}\n' > "$SEED_DIR/.crewai_user.json"
fi

type_text() {
  local text="$1" i ch
  for ((i = 0; i < ${#text}; i++)); do
    ch="${text:$i:1}"; tmux send-keys -t "$SESSION" -l "$ch"; sleep "0.0$((RANDOM % 4 + 2))"
  done
}
enter() { tmux send-keys -t "$SESSION" Enter; }
await() {
  local pat="$1" timeout="${2:-120}" waited=0
  while ! tmux capture-pane -p -t "$SESSION" -S -80 | grep -qE "$pat"; do
    sleep 0.5; waited=$((waited + 1))
    if [ "$waited" -ge $((timeout * 2)) ]; then
      tmux capture-pane -p -t "$SESSION" -S -40 >&2
      die "await timed out: /$pat/"
    fi
  done
}

tmux kill-session -t "$SESSION" 2>/dev/null || true
printf "PS1='\\[\\033[2m\\]~/quickstart\\[\\033[0m\\] \$ '\n" > "$WORK/.demorc"
tmux new-session -d -s "$SESSION" -x "$COLS" -y "$ROWS" \
  env HOME="$WORK" PATH="$PATH" TERM=xterm-256color \
  bash --rcfile "$WORK/.demorc" --noprofile -i
tmux set-option -t "$SESSION" status off
tmux send-keys -t "$SESSION" "cd $WORK && clear" Enter
sleep 1

rm -f "$CAST"
asciinema rec --window-size "${COLS}x${ROWS}" --quiet -c "tmux attach -t $SESSION" "$CAST" &
REC=$!
trap 'tmux kill-session -t "$SESSION" 2>/dev/null || true' EXIT
sleep 1.5

# 1 — fresh venv. "Creating virtual environment" can't appear in the command.
type_text "uv venv && source .venv/bin/activate"; enter
await "Creating virtual environment" 90
sleep 1.5

# 2 — install, then prove what landed. One command, so the grep output is the
# completion signal. The package name alone would match the typed line; the
# version column can only come from `uv pip list`.
type_text "uv pip install -q $PKGS && uv pip list | grep -E '$LISTGREP'"; enter
await "acp-[a-z]+[[:space:]]+[0-9]" 420
sleep 3

# 3 — the whole integration surface: two decorators and one context call.
type_text "sed -n '${DECOR}p' starter.py"; enter
sleep 5
type_text "sed -n '${CTX}p' starter.py"; enter
sleep 5

# 4 — a real run against the real gateway. `clear` so nothing above can
# satisfy the await; match the record id, never the model's wording.
type_text "clear"; enter
sleep 1
type_text "python starter.py"; enter
await "abc-123|Traceback|command not found|Error" 420
if tmux capture-pane -p -t "$SESSION" -S -40 | grep -qE "Traceback|command not found|SystemExit|Missing "; then
  tmux capture-pane -p -t "$SESSION" -S -40 >&2
  die "the run failed — take aborted (pane above). Fix, then re-record."
fi
sleep 5

sleep 2
tmux kill-session -t "$SESSION" 2>/dev/null || true
wait "$REC" 2>/dev/null || true
trap - EXIT
say "Recorded → $CAST"

RCAST="$CAST"
CUT="$(grep -n 'exited' "$CAST" 2>/dev/null | head -1 | cut -d: -f1 || true)"
if [ -n "$CUT" ] && [ "$CUT" -gt 3 ]; then
  RCAST="${CAST%.cast}.render.cast"
  head -n "$((CUT - 2))" "$CAST" > "$RCAST"
  printf '[3.5, "o", ""]\n' >> "$RCAST"
fi
agg --font-size 16 --idle-time-limit 3 --speed 1.15 --theme dracula "$RCAST" "$GIF" 2>/dev/null
[ "$RCAST" != "$CAST" ] && rm -f "$RCAST"
command -v gifsicle >/dev/null && { gifsicle -O3 --lossy=80 --colors 128 -o "$GIF.opt" "$GIF" && mv "$GIF.opt" "$GIF"; }
ffmpeg -y -loglevel error -i "$GIF" -movflags faststart -pix_fmt yuv420p \
  -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" "$MP4"

say "Done."
echo "  $GIF"
echo "  $MP4"
