# Legacy prototype (pre-rewrite)

This directory holds the original single-file prototype of "TD's Only League",
kept for reference only. It is **not** part of the new Next.js + Supabase app
and is not built, run, or deployed as part of the rewrite.

- `index.html` — the original client: game logic (roster rules, scoring,
  draft flow) and the ESPN unofficial API call shapes
  (`site.api.espn.com/apis/site/v2/sports/football/nfl/...` for scoreboard,
  teams, and team rosters) were first prototyped here.
- `main.py` — a FastAPI + WebSocket server that served the HTML above and
  broadcast draft events to connected clients. Reference for the realtime
  draft-broadcast shape; the rewrite uses Supabase Realtime instead.
- `requirements.txt` — Python deps for `main.py` (fastapi, uvicorn).

Use these files to cross-check scoring rules, roster constraints, and ESPN
API endpoints/response shapes while building the rewrite — do not import code
from here directly.
