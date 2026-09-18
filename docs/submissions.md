# maxx — where to submit

A prioritized, actionable checklist for getting **maxx** in front of people building tools.
Repo: `github.com/reif-y/Maxx` · Install: `/plugin marketplace add reif-y/Maxx` → `/plugin install maxx@maxx`

---

## Ready-to-paste assets

*Refreshed 2026-09-18. The old copy described "race-track meters" and zero-egress as the headline;
both are stale — the meters were replaced by one reading per wall, and the pitch is now the
accounts view plus the fenix loop.*

**One-liner:**
> maxx — all your Claude accounts in one place. A statusline that says how long the week lasts at
> the rate you're burning it, `/maxx accounts` for every login you're signed into (which is walled,
> when it frees up), and `/fenix` to carry a thread across the `/clear` that empties it. Local by
> default: no account, no network, nothing to be down.

**Short blurb (directories):**
> Most people running Claude Code seriously are signed into more than one account, and no screen
> shows them together — so you find out one is walled by hitting the wall. maxx is that screen. The
> statusline reads the week as clock-against-runway (hours to reset vs hours the budget actually
> lasts at your current burn), scores how full the chat is against its hand-off line, and when that
> line is close, fenix writes a handoff so the `/clear` costs you the tokens and not the work.
> Numbers come from Anthropic's own per-session limits, already summed across every machine on the
> login — so it needs no account and no server.

**Show HN title:**
> Show HN: maxx – see every Claude account you're signed into, and when the week runs dry

**The demo line (what to paste in a comment):**
> ```
> @you · opus │ chat 94% │ session 12% · 2h54m │ week 150h/11h │ Maxx · main · f6a931d9 │ /maxx
> ```
> `week 150h/11h` = 150 hours until the weekly cap resets, 11 hours of budget left at the current
> burn. Runway short of the clock means you run dry early, and the gap is how long you sit locked out.

**GitHub topics:**
`claude-code` · `claude-plugin` · `claude-code-plugins-marketplace` · `statusline` · `cli` ·
`tokens` · `developer-tools` · `context-management`

**Angles that land:** multi-account visibility (nothing else shows it) · the week in hours, not a
percentage · handoff across `/clear` · local by default, no account required.

---

## Tier 1 — Claude Code ecosystem (your exact audience, do first)

- [ ] **Anthropic official directory** — submit form: https://clau.de/plugin-directory-submission
      → lands in `github.com/anthropics/claude-plugins-official` / `claude-community`. Reviewed for quality + security (zero-egress helps). Installs with no `marketplace add` step.
- [ ] **awesome-claude-code** (canonical list, has a *status lines* section): https://github.com/hesreallyhim/awesome-claude-code — open an issue/PR to add maxx.
- [ ] **claudemarketplaces.com** (largest community directory, voting + comments): https://claudemarketplaces.com/
- [ ] **claudepluginhub.com** — independent browse/rate/submit directory.
- [ ] **claudecodecommands.directory** — submit the `/maxx` command/skill: https://claudecodecommands.directory/submit
- [ ] **awesome-claude-code-toolkit** (rohitg00): https://github.com/rohitg00/awesome-claude-code-toolkit — PR.
- [ ] **jqueryscript/awesome-claude-code**: https://github.com/jqueryscript/awesome-claude-code — PR.
- [ ] **awesome-skills.com**: https://awesome-skills.com/ — submit the skill/plugin.
- [ ] **awesomeclaude.ai** (visual directory): https://awesomeclaude.ai/awesome-claude-code

## Tier 2 — developer-tool launch platforms (broader splash)

- [ ] **Hacker News — Show HN** ⭐ (gold standard for CLI/dev tools; technical merit wins): https://news.ycombinator.com/showhn.html
- [ ] **DevHunt** (Product Hunt built for dev tools, converts better for CLIs): https://devhunt.org
- [ ] **Product Hunt**: https://www.producthunt.com/
- [ ] **Smol Launch** (7-day window, suits install-test-return tools): https://smol.pub / smollaunch
- [ ] **Peerlist** (dev-facing audience): https://peerlist.io/
- [ ] **Lobsters** — Show (invite-based, very technical): https://lobste.rs/
- [ ] **Indie Hackers**: https://www.indiehackers.com/

## Tier 3 — subreddits & communities

- [ ] **r/ClaudeAI**: https://reddit.com/r/ClaudeAI
- [ ] **r/ClaudeCode** (if active): https://reddit.com/r/ClaudeCode
- [ ] **r/commandline**: https://reddit.com/r/commandline
- [ ] **r/devtools** / **r/coolgithubprojects**
- [ ] **Anthropic / Claude Developers Discord** — share in the tools/plugins channel.
- [ ] **X / Twitter** — post the GIF, tag the Claude Code / dev-tools community.
- [ ] **Dev.to** — a short "I built a token-budget statusline for Claude Code" post: https://dev.to/

---

## Suggested sequence

1. **This week:** Tier 1 items 1–4 (official form, awesome-claude-code, claudemarketplaces, pluginhub) + add GitHub topics.
2. **Once the README GIF is live (done ✅):** coordinated launch day — **Show HN** + **DevHunt** + **r/ClaudeAI** + **X** in the same 24h. Reply fast to comments.
3. **Follow-up:** the remaining awesome-list PRs + Product Hunt + Dev.to writeup.

> Tip: a strong 2026 launch is 5–10 surfaces in one week, not one big bang. Lead with the technical venues (HN/DevHunt) where the audience *is* your users.

_Note: some community-directory submit URLs move around — if a `/submit` link 404s, check the site's nav or its GitHub repo's CONTRIBUTING._
