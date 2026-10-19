# Garebears Courtside

Neon ESPN fantasy dashboard for The Angel Reese Invitational.

- `index.html` is the dashboard, served by GitHub Pages.
- `fetch.py` pulls the league from ESPN's fantasy API and writes `data.json`.
- `.github/workflows/refresh.yml` runs `fetch.py` every 30 minutes and commits fresh data.

## Setup
1. Settings > Secrets and variables > Actions: add `ESPN_S2` and `ESPN_SWID` (cookies from a signed-in ESPN session).
2. Settings > Pages: deploy from branch `main`, folder `/ (root)`.
3. Actions > Refresh ESPN data > Run workflow.
