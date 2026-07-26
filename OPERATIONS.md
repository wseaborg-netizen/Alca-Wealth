# Alca Wealth Operations Guide

This is the owner's manual for running the Alca Wealth website. It assumes you are **not** a developer.

Every command below was tested against this actual project on the day this guide was written.

**Your project lives here:**

```
~/Desktop/Alca Wealth
```

**Your live website is here:**

```
https://alcawealth.vercel.app
```

**Two things I could not confirm** (I will not guess):

1. The Terminal command that launches Claude Code. The `claude` command is **not installed on your PATH**, so I cannot tell you a command that works. Open Claude Code the way you normally do (the app), and point it at the folder `~/Desktop/Alca Wealth`.
2. Whether saving to GitHub automatically publishes the website. Your project **is** connected to GitHub (`github.com/wseaborg-netizen/Alca-Wealth`), but I could not verify that pushing there triggers a deployment. **Use the deploy command in Section 9** — that one is verified to work.

---

## 1. One-Minute Quick Start

**Goal:** see the website running on your own computer.

**1. FINDER / TERMINAL — Open Terminal.**
Press `Command + Space`, type `Terminal`, press `Return`.

**2. TERMINAL — Go into the project folder.**

```
cd ~/Desktop/"Alca Wealth"
```

*Success looks like:* the text before your cursor now ends with `Alca Wealth`.
*If it fails:* see Section 11 → "Terminal is in the wrong folder."

**3. CLAUDE CODE — Start Claude Code.**
Open the Claude Code app and set its folder to `~/Desktop/Alca Wealth`.
(As noted above, I could not confirm a Terminal command for this.)

**4. TERMINAL — Open a second Terminal window.**
Press `Command + N`. Then run the same folder command again in the new window:

```
cd ~/Desktop/"Alca Wealth"
```

**5. TERMINAL — Start the local website.**

```
npm run dev
```

*Success looks like:* a message containing `Ready` and `http://localhost:3000`.
Leave this window open. The website only runs while this is running.

**6. BROWSER — Open the website.**

```
http://localhost:3000
```

*Success looks like:* the Alca Wealth site loads.
*If the page does not load:* see Section 11 → "Port already in use."

**7. TERMINAL — Stop the local website.**
Click the Terminal window running the website, then press:

```
Control + C
```

*Success looks like:* your normal cursor returns. The browser page will now fail to load — that is expected.

> **Note:** "Local website" means it runs only on your computer. Nobody else can see it. It does **not** change the live site.

---

## 2. What Should I Do?

Find your situation, go to that section.

| I want to… | Go to |
|---|---|
| View the website on my computer | Section 1 |
| Make a change to the website | Section 4 |
| Add new funds | Section 5 |
| Fix funds stuck in "review" | Section 6 |
| Test that everything works | Section 8 |
| Publish changes to the live site | Section 9 |
| Something is broken | Section 11 |
| Undo a change I regret | Section 10 |
| Know what a folder is for | Section 7 |
| Copy a ready-made instruction for Claude | Section 12 |

---

## 3. Commands I Use Most

Run every command **after** you are inside the project folder (Step 2 of Section 1).

| What I want to do | Where | Exact command | What it does | What success looks like |
|---|---|---|---|---|
| Open the project | TERMINAL | `cd ~/Desktop/"Alca Wealth"` | Moves Terminal into the project | Your cursor line ends with `Alca Wealth` |
| Start Claude Code | CLAUDE CODE | *(not confirmed — open the app)* | Lets Claude read/edit the project | Claude shows the `Alca Wealth` folder |
| Start the local website | TERMINAL | `npm run dev` | Runs the site on your computer | Shows `Ready` and `http://localhost:3000` |
| Add funds | APP | Expansion tab | Adds a fund at runtime (Tiingo coverage check + human classification review) | The fund enters the verified universe once approved |
| Classify funds | TERMINAL | `npm run funds:classify` | Sorts reference identity into categories | Shows `verified`, `need review`, and `0 invalid values` |
| Check the fund data is correct | TERMINAL | `npm run funds:validate` | Six safety checks on the data | Ends with `PASS — fund data is valid.` |
| Run tests | TERMINAL | `npm test` | Runs automated checks | `Tests: 11 passed, 11 total` |
| Run the code style checker | TERMINAL | `npm run lint` | Flags code style issues | **See warning below** |
| Build the production version | TERMINAL | `npm run build` | Compiles the real website | Finishes with a list of routes, no `error` |
| Publish to the live website | TERMINAL | `npx vercel --prod` | Deploys to alcawealth.vercel.app | Prints `Production` and `Aliased` URLs |

> **Important, verified:** `npm run lint` currently **fails** (it reports pre-existing style errors that were there before this guide). This is **known and is not a blocker**. Do **not** treat a failing lint as a reason to stop. Tests and build are the checks that matter.

> **Note:** `npx vercel` is correct. The `vercel` command by itself is not installed on your computer.

---

## 4. Making a Website Change

**1. CLAUDE CODE — Open Claude Code** on the folder `~/Desktop/Alca Wealth`.

**2. CLAUDE CODE — Paste a clear request.** Use the prompt at the end of this section.

**3. CLAUDE CODE — Let Claude read the code first.** Do not rush it. It should tell you which files it looked at.

**4. CLAUDE CODE — Read the summary.** Claude must tell you which files changed and what changed. If it did not say, ask it.

**5. TERMINAL — Start the local website.**

```
npm run dev
```

*Success looks like:* `Ready` and `http://localhost:3000`.

**6. BROWSER — Look at your change.**

```
http://localhost:3000
```

Click through the part you changed. If it looks wrong, tell Claude exactly what looks wrong.

**7. TERMINAL — Stop the site (`Control + C`), then run the tests.**

```
npm test
```

*Success looks like:* `Tests: 11 passed, 11 total`.

**8. TERMINAL — Build the production version.**

```
npm run build
```

*Success looks like:* a route list and no line containing `error`.
*If it fails:* see Section 11 → "Production build fails."

**9. Deploy only if steps 7 and 8 both passed.** Go to Section 9.

### Copyable prompt — making a change

```
Make the following change to Alca Wealth:

[DESCRIBE THE CHANGE]

Before editing:
- Inspect the relevant files and existing architecture.
- Preserve all existing functionality.
- Do not change unrelated code.
- Follow the current design system and project structure.

After editing:
- Test the affected feature.
- Run npm test.
- Run npm run build.
- Do not deploy.
- Report the files changed, what changed, and all test results.
- Do not ask unnecessary questions. Make reasonable decisions and complete the task.
```

---

## 5. Adding New Funds

### The ticker file

The list of funds lives in exactly one place:

```
data/input/fund-tickers.txt
```

**How to enter tickers (verified against the code that reads this file):**

- **One ticker per line** is the normal way. Commas also work.
- Lowercase is fine — it is converted to uppercase automatically.
- Blank lines are ignored.
- A line starting with `#` is ignored (use it for notes).
- Duplicates are removed automatically.

Example of a correct file:

```
VTI
VOO
SCHD
```

**1. FINDER — Open the file.**
Open `~/Desktop/Alca Wealth/data/input/fund-tickers.txt` in TextEdit (or any plain-text editor).

**2. FINDER — Add your tickers, one per line, then save** with `Command + S`.

**3. TERMINAL — Run the full fund pipeline.**

```
npm run funds:classify
```

*Success looks like:* it finishes with a `verified` count, a `need review` count, and `taxonomy check: 0 invalid values`.
*If a ticker fails:* that is normal for some funds — see below.

**4. TERMINAL — Check the data is safe to publish.**

```
npm run funds:validate
```

*Success looks like:*

```
PASS — fund data is valid.
```

### What the three result files mean

| File | Meaning |
|---|---|
| `data/generated/fund-universe.json` | **Verified** funds. These are the funds the website actually shows. |
| `data/generated/fund-review-queue.json` | **Review** funds. The computer could not confidently categorize them. They are **not** on the website. |
| `data/generated/fund-import-failures.json` | **Failed** funds. The data provider (Tiingo) does not have this ticker at all. |

- **Verified** = correctly categorized and live on the site.
- **Review** = the fund exists, but its name did not clearly reveal its category. A human decision is needed. See Section 6.
- **Failed** = Tiingo has no record of this ticker. Either the ticker is wrong, or Tiingo simply does not cover that fund.

> **Do not manually edit anything inside `data/generated/`.** Those files are rewritten from scratch every time you run the pipeline. Your edits would be erased.

### Why you must wait before deploying

`npm run funds:validate` fails if **review** or **failed** is anything other than zero.

- A **review** fund is missing from the website with no explanation.
- A **failed** ticker means the site is silently ignoring a fund you asked for.

Deploying in that state ships an incomplete fund list. Get both to zero first.

---

## 6. Resolving Review Funds

**Where the review queue lives:**

```
data/generated/fund-review-queue.json
```

**Why a fund lands in review:** the classifier only reads the fund's official name. If the name does not clearly state the category (for example, "Ariel Fund" tells you nothing about its size or style), the fund is set aside instead of being guessed at. That is deliberate and correct.

> **Do not manually edit `fund-review-queue.json`.** It is regenerated on every run and your edits will vanish. The fix must go into the classifier rules or the overrides file.

**There are two correct ways to fix a review fund:**

1. **A reusable classifier rule** — use this when the same logic applies to several similar funds. Example: every fund whose name contains "Mortgage-Backed" is a government bond fund. One rule fixes all of them, now and in the future.
2. **A manual override** — use this only for a genuine one-off exception, where the fund's name simply cannot tell you the answer. Overrides live in:

```
data/config/fund-classification-overrides.json
```

**Claude must never invent a classification.** If the fund's real category cannot be determined from its official name and verified data, it must stay in review rather than be given a made-up answer. A wrong category silently corrupts the benchmark and the portfolio builder.

### Copyable prompt — resolving review funds

```
Resolve every fund currently in the generated review queue.

Requirements:
- Inspect each ticker, official fund name, available Tiingo metadata, current taxonomy, and existing classifier rules.
- Use only valid controlled-taxonomy values.
- Add a deterministic classifier rule when the logic applies to multiple similar funds.
- Use the classification overrides file only for genuine exceptions.
- Do not remove funds to make validation pass.
- Do not change already verified funds unless a proven classification error exists.
- Do not invent classifications.

After resolving them, run:
- npm run funds:classify
- npm run funds:validate
- npm test
- npm run build

Required result:
- zero review funds
- zero failed imports
- zero invalid taxonomy values
- validation passes
- tests pass
- production build passes

Do not deploy.
Report exactly what changed.
```

---

## 7. Main Folders and Files

| Item | What it contains | Edit it? | Delete it? | Auto-regenerated? |
|---|---|---|---|---|
| `data/input/` | `fund-tickers.txt` — your list of funds | **Yes** — this is yours | No | No |
| `data/config/` | `fund-taxonomy.json` (allowed categories), `fund-classification-overrides.json` (one-off fixes) | Only with Claude's help | No | No |
| `data/generated/` | The four result files from the pipeline | **Never** | No | **Yes** — rewritten each run |
| `scripts/` | The programs that import, classify, and validate funds | Only with Claude's help | No | No |
| `src/` | The website's actual code | Only with Claude's help | No | No |
| `public/` | Images used by the site | Rarely | No | No |
| `node_modules/` | Downloaded building blocks (very large) | Never | Yes, if desperate | Yes, via `npm install` |
| `package.json` | The list of commands and dependencies | Only with Claude's help | **No** | No |
| `.env.local` | **Your secret API keys** | Only to add a key | **No** | No |
| `OPERATIONS.md` | This guide | Yes | No | No |

**Rules to never break:**

- **Do not manually edit files inside `data/generated/`.** They are overwritten on every pipeline run.
- **Do not delete source or configuration files** (`src/`, `scripts/`, `package.json`, `tsconfig.json`, `next.config.ts`, and the other config files at the top level).
- `node_modules/` can be rebuilt with `npm install`, but normally you should leave it alone.
- `tsconfig.tsbuildinfo` is a temporary speed-up file. It is safe to delete and it will come back on its own.
- **`.env.local` contains secrets.** Never share it, never upload it, never commit it, never post it online.
- **Never paste an API key into a Claude chat, into this document, or into any message.** Your keys are `TIINGO_API_KEY` and `APP_PASSWORD`. Claude reads them from the file automatically — it never needs you to type them.

---

## 8. Full Testing Checklist

Run these **one at a time, in this order.** Do not combine them. **Stop at the first failure** and fix it before continuing.

**1. TERMINAL — Validate the fund data.**

```
npm run funds:validate
```

*Success:* ends with `PASS — fund data is valid.` This single command confirms all six of: valid file structure, no duplicate tickers, valid categories, every fund verified, **zero review funds**, and **zero failed imports**.
*Stop here if it says `FAIL`.* Go to Section 6.

**2. TERMINAL — Run the tests.**

```
npm test
```

*Success:* `Tests: 11 passed, 11 total`.
*Stop here if any test fails.* Go to Section 11 → "Tests fail."

**3. TERMINAL — Build the production version.**

```
npm run build
```

*Success:* a list of routes appears and no line says `error`.
*Stop here if it fails.* Go to Section 11 → "Production build fails."

**4. TERMINAL — Start the local website.**

```
npm run dev
```

*Success:* `Ready` and `http://localhost:3000`.

**5. BROWSER — Confirm the site loads.**

```
http://localhost:3000
```

*Success:* the homepage appears with no error screen.

**6. BROWSER — Confirm fund search works.**
Go to the Discover screen and search for a fund you know exists, such as `VTI`.
*Success:* results appear and `VTI` is among them.

**7. BROWSER — Confirm portfolio creation works.**
Go to Portfolios and build a portfolio.
*Success:* each sleeve fills in with a fund. Nothing comes back empty.

**8. BROWSER — Confirm the important data routes respond.**
Open each of these. Each should show text/data, not an error page.

```
http://localhost:3000/api/universe
```

```
http://localhost:3000/api/funds/VTI
```

*Success:* `/api/universe` shows a long list of funds. `/api/funds/VTI` shows details for Vanguard Total Stock Market ETF.

**9. TERMINAL — Stop the local website.**

```
Control + C
```

When all nine steps pass, you are safe to deploy.

---

## 9. Deployment

"Deploying" means publishing your local work to the real website that other people can see.

**Deployment method (verified):** a Terminal command run from inside the project folder. Your project is linked to a Vercel project, and this command publishes it and points `alcawealth.vercel.app` at the new version.

### Checks that must pass first

Do not deploy unless **all** of these are true:

- `npm run funds:validate` says `PASS`
- Zero review funds and zero failed imports (validate confirms both)
- `npm test` passes
- `npm run build` passes

(A failing `npm run lint` is **not** a blocker — see the warning in Section 3.)

### Deploying

**1. TERMINAL — Make sure you are in the project folder.**

```
cd ~/Desktop/"Alca Wealth"
```

**2. TERMINAL — Deploy.**

```
npx vercel --prod
```

*Success looks like:* output containing a `Production` URL and a line reading:

```
Aliased    https://alcawealth.vercel.app
```

along with `readyState: "READY"`.

*If it fails:* see Section 11 → "Vercel deployment fails."

### Confirming the deployment worked

**3. BROWSER — Open the live site.**

```
https://alcawealth.vercel.app
```

*Success:* the homepage loads.

**4. BROWSER — Check the live fund list.**

```
https://alcawealth.vercel.app/api/universe
```

*Success:* a long list of funds appears.

**5. BROWSER — Test the live site by hand.**
- The homepage loads.
- Fund search returns results.
- Building a portfolio fills every sleeve.
- Open a fund's Analysis page and confirm numbers appear.

### How to confirm you are seeing the *new* version

Pick something you know you just changed (a new fund ticker, or a visible text change) and look for it on the live site. If it is there, the new version is live.

### If the website still shows old content

This is almost always your browser showing a saved copy.

1. **BROWSER — Hard refresh:** press `Command + Shift + R`.
2. **BROWSER — Still old?** Open the site in a Private/Incognito window.
3. **TERMINAL — Still old?** Confirm the deploy actually finished by re-running the deploy command and checking it printed `Aliased  https://alcawealth.vercel.app`.
4. Still old after all three? Ask Claude Code to inspect it.

### Copyable prompt — deploying

```
Prepare and deploy the current Alca Wealth project to Vercel.

Before deploying:
- Run npm run funds:validate.
- Run npm test.
- Run npm run build.
- Stop immediately if any check fails.
- Do not deploy review funds or failed imports.

After deploying:
- Confirm the production deployment completed.
- Test the production homepage.
- Test fund search.
- Test portfolio creation.
- Test the important API routes.
- Report the production URL and all results.
```

---

## 10. Undoing a Broken Change

Your project uses **Git**, a system that records snapshots of your work.

**Plain-English definitions:**

- An **uncommitted change** is an edit you made that has **not** been saved into the project's history yet. It exists only in the files on your disk. It is the easiest thing to throw away.
- A **commit** is a saved snapshot with a label, permanently recorded in the project's history. You can always return to an earlier commit.

**Your current setup (verified):** you are on a branch named `cleanup/alca-wealth-restructure`, and the project is connected to GitHub at `github.com/wseaborg-netizen/Alca-Wealth`.

### See what has changed but is not yet saved

```
git status
```

*Success:* it lists changed files, or says `nothing to commit, working tree clean`.

### See the recent snapshots

```
git log --oneline -10
```

*Success:* up to ten lines, each starting with a short code like `5b5e86d` followed by a description.
Press `q` to exit if the list takes over your screen.

### Safely undo one committed change

This creates a **new** snapshot that cancels out an old one. It does not erase history, which is why it is the safe choice.

```
git revert <the-short-code-from-git-log>
```

*Success:* Git makes a new commit describing what it undid.

### Throw away edits to one file that you have not saved

> **⚠️ WARNING — DESTRUCTIVE.** This permanently deletes your unsaved edits to that file. There is no undo.

```
git restore path/to/the/file
```

*Success:* the file returns to its last saved state.

### Commands you must never run casually

> **⚠️ DANGER.** These can permanently destroy work, including work Git cannot recover:
>
> - `git reset --hard`
> - `git clean -fd`
> - any `git push --force`
>
> **Do not run `reset --hard`, `clean -fd`, or force-push commands unless Claude Code has inspected the repository and explained exactly what will be removed.**

### Copyable prompt — rolling back

```
Inspect the current Git status and recent commits.

I need to undo this change:

[DESCRIBE THE BROKEN CHANGE]

Requirements:
- Do not use destructive Git commands without explaining their effect.
- Preserve unrelated work.
- Identify whether the change is committed or uncommitted.
- Use the safest rollback method.
- Show me exactly what will be changed before doing it.
- Run tests and build afterward.
- Do not deploy.
```

---

## 11. Common Problems

### `package.json not found`
1. **Means:** Terminal is not inside the project folder.
2. **Safest first action:** go to the folder.
3. **Command:**
```
cd ~/Desktop/"Alca Wealth"
```
4. **Success:** run `ls` and you see `package.json` listed.
5. **Stop and ask Claude** if the folder itself is missing.

### Terminal is in the wrong folder
1. **Means:** commands are running somewhere else on your Mac.
2. **Safest first action:** check where you are.
3. **Command:**
```
pwd
```
4. **Success:** it prints `/Users/willseaborg/Desktop/Alca Wealth`. If not, run the `cd` command above.
5. **Stop and ask Claude** if `cd` reports "No such file or directory."

### Port already in use
1. **Means:** the website is already running in another Terminal window.
2. **Safest first action:** find that window and press `Control + C`.
3. **Command (only if you cannot find the window):**
```
lsof -ti:3000 | xargs kill
```
4. **Success:** `npm run dev` now starts and shows `Ready`.
5. **Stop and ask Claude** if the port is still busy after that.

### `claude: command not found`
1. **Means:** Claude Code is not available as a Terminal command on your Mac. **This is expected — it is not installed on your PATH.**
2. **Safest first action:** open the Claude Code application normally instead.
3. **Command:** none.
4. **Success:** Claude Code is open and pointed at `~/Desktop/Alca Wealth`.
5. **Stop and ask Claude** nothing — this is not a fault.

### `npm: command not found`
1. **Means:** Node.js is missing or your Terminal cannot find it.
2. **Safest first action:** check whether it exists.
3. **Command:**
```
node --version
```
4. **Success:** it prints a version number (yours was `v24.16.0`).
5. **Stop and ask Claude Code to inspect it** if it prints nothing. Do not reinstall Node on your own.

### `node_modules` missing
1. **Means:** the downloaded building blocks are gone.
2. **Safest first action:** reinstall them. This is safe and can take a few minutes.
3. **Command:**
```
npm install
```
4. **Success:** it finishes without the word `error`, and a `node_modules` folder exists.
5. **Stop and ask Claude** if it ends with errors.

### Environment variable missing
1. **Means:** a required secret (such as `TIINGO_API_KEY`) is not in `.env.local`.
2. **Safest first action:** check which keys exist — **this prints only names, never the secret values.**
3. **Command:**
```
grep -oE '^[A-Z_]+=' ~/Desktop/"Alca Wealth"/.env.local
```
4. **Success:** you see `TIINGO_API_KEY=` and `APP_PASSWORD=`.
5. **Stop and ask Claude Code to inspect it** if one is missing. **Never paste the key itself into chat.**

### Tiingo ticker import failure
1. **Means:** the data provider has no record of that ticker. It appears in `data/generated/fund-import-failures.json`.
2. **Safest first action:** check the ticker is spelled correctly in `data/input/fund-tickers.txt`.
3. **Command:**
```
npm run funds:classify
```
4. **Success:** the failure count drops to `0`.
5. **Stop and ask Claude** if the ticker is spelled right but still fails — the provider may genuinely not cover that fund, and Claude must decide what to do.

### Funds remain in review
1. **Means:** the classifier could not confidently categorize them.
2. **Safest first action:** do **not** edit the review file. Ask Claude.
3. **Command:** none — use the prompt in Section 6.
4. **Success:** `npm run funds:validate` says `PASS`.
5. **Stop and ask Claude** immediately. Never guess a category yourself.

### Validation fails
1. **Means:** something in the fund data is unsafe to publish. The output names exactly which of the six checks failed.
2. **Safest first action:** read the lines beginning with `✗`.
3. **Command:**
```
npm run funds:validate
```
4. **Success:** `PASS — fund data is valid.`
5. **Stop and ask Claude Code to inspect it**, quoting the failing lines. **Do not deploy.**

### Tests fail
1. **Means:** an automated check caught a real problem.
2. **Safest first action:** do not deploy.
3. **Command:**
```
npm test
```
4. **Success:** `Tests: 11 passed, 11 total`.
5. **Stop and ask Claude Code to inspect it**, pasting the failure text.

### Production build fails
1. **Means:** the website cannot be compiled. It would be broken if published.
2. **Safest first action:** do not deploy. Read the first error message, not the last.
3. **Command:**
```
npm run build
```
4. **Success:** a route list appears and no line says `error`.
5. **Stop and ask Claude Code to inspect it**, pasting the first error.

### Vercel deployment fails
1. **Means:** publishing did not complete. **Your live site is unchanged and still safe.**
2. **Safest first action:** confirm you are in the right folder — deploying from the wrong folder is the most common cause.
3. **Command:**
```
cd ~/Desktop/"Alca Wealth" && npx vercel --prod
```
4. **Success:** output shows `Aliased  https://alcawealth.vercel.app` and `readyState: "READY"`.
5. **Stop and ask Claude Code to inspect it** if it fails twice.

### Website still shows old content
1. **Means:** almost always your browser is showing a saved copy.
2. **Safest first action:** hard refresh with `Command + Shift + R`, then try a Private window.
3. **Command:** none in Terminal.
4. **Success:** you can see the thing you changed.
5. **Stop and ask Claude** if a Private window still shows the old version.

### Claude Code opens in the wrong folder
1. **Means:** Claude is reading a different project and its answers will be wrong.
2. **Safest first action:** close it and reopen it on `~/Desktop/Alca Wealth`.
3. **Command:** ask Claude to run this and show you the result:
```
pwd
```
4. **Success:** it prints `/Users/willseaborg/Desktop/Alca Wealth`.
5. **Stop and ask Claude** to switch folders before letting it change anything. This matters — an old copy of this project once caused a failed deployment.

---

## 12. Copyable Claude Code Prompts

### Making a website change
```
Make the following change to Alca Wealth:

[DESCRIBE THE CHANGE]

Before editing:
- Inspect the relevant files and existing architecture.
- Preserve all existing functionality.
- Do not change unrelated code.
- Follow the current design system and project structure.

After editing:
- Test the affected feature.
- Run npm test.
- Run npm run build.
- Do not deploy.
- Report the files changed, what changed, and all test results.
- Do not ask unnecessary questions. Make reasonable decisions and complete the task.
```

### Adding funds
```
I have added new tickers to data/input/fund-tickers.txt.

Please:
- Run npm run funds:classify.
- Run npm run funds:validate.
- Report the verified, review, and failed counts.
- If any tickers failed to import, tell me which ones and why.
- If any funds are in review, list them with their official names and explain why each one could not be classified.
- Do not invent classifications.
- Do not deploy.
```

### Resolving review funds
```
Resolve every fund currently in the generated review queue.

Requirements:
- Inspect each ticker, official fund name, available Tiingo metadata, current taxonomy, and existing classifier rules.
- Use only valid controlled-taxonomy values.
- Add a deterministic classifier rule when the logic applies to multiple similar funds.
- Use the classification overrides file only for genuine exceptions.
- Do not remove funds to make validation pass.
- Do not change already verified funds unless a proven classification error exists.
- Do not invent classifications.

After resolving them, run:
- npm run funds:classify
- npm run funds:validate
- npm test
- npm run build

Required result:
- zero review funds
- zero failed imports
- zero invalid taxonomy values
- validation passes
- tests pass
- production build passes

Do not deploy.
Report exactly what changed.
```

### Investigating a failed ticker
```
The ticker [TICKER] is appearing in data/generated/fund-import-failures.json.

Please:
- Confirm the exact reason the import failed.
- Check whether the ticker is spelled correctly and whether the data provider covers it.
- Tell me plainly whether this fund can be included or not.
- Do not remove the ticker from the input file without explaining why.
- Do not invent data.
- Do not deploy.
```

### Fixing a bug
```
There is a bug in Alca Wealth:

What I did: [STEPS]
What I expected: [EXPECTED]
What actually happened: [ACTUAL]

Please:
- Reproduce the problem before changing anything.
- Find the true root cause rather than hiding the symptom.
- Show me the cause before you fix it.
- Preserve all unrelated behavior.
- Run npm test and npm run build afterward.
- Do not deploy.
- Report exactly what you changed and why.
```

### Testing the full website
```
Run the complete verification for Alca Wealth.

In this order:
- npm run funds:validate
- npm test
- npm run build

Then start the local site and confirm:
- The homepage loads.
- Fund search returns results.
- Portfolio creation fills every sleeve.
- /api/universe and /api/funds/VTI both respond correctly.

Stop the local server when finished.
Report the result of every step, including the verified, review, and failed fund counts.
Do not deploy.
```

### Safely cleaning unused files
```
Audit the Alca Wealth project for files that are no longer used.

Requirements:
- Prove a file is unused before proposing deletion: no imports, no runtime reads, no package script usage, no build usage, no deployment usage, and no current documentation value.
- Never delete node_modules, .env.local, required framework configuration, or active documentation.
- Never delete anything inside data/config or data/input.
- List everything you propose to delete and the evidence, and wait for my approval before deleting.
- After any deletion, run npm test and npm run build.
- Do not deploy.
```

### Deploying
```
Prepare and deploy the current Alca Wealth project to Vercel.

Before deploying:
- Run npm run funds:validate.
- Run npm test.
- Run npm run build.
- Stop immediately if any check fails.
- Do not deploy review funds or failed imports.

After deploying:
- Confirm the production deployment completed.
- Test the production homepage.
- Test fund search.
- Test portfolio creation.
- Test the important API routes.
- Report the production URL and all results.
```

### Rolling back a change
```
Inspect the current Git status and recent commits.

I need to undo this change:

[DESCRIBE THE BROKEN CHANGE]

Requirements:
- Do not use destructive Git commands without explaining their effect.
- Preserve unrelated work.
- Identify whether the change is committed or uncommitted.
- Use the safest rollback method.
- Show me exactly what will be changed before doing it.
- Run tests and build afterward.
- Do not deploy.
```

### Auditing overall project health
```
Give me an honest health report on Alca Wealth.

Check and report:
- Fund counts: verified, review, failed.
- Whether npm run funds:validate passes.
- Whether npm test passes.
- Whether npm run build passes.
- Whether the deployed site matches the local code.
- Any dead code, unused dependencies, or stale documentation.
- Any risk you would want me to know about.

Do not change anything. Do not deploy. Report only.
```

---

## 13. End-of-Day Checklist

Work through this before you walk away.

- [ ] All my file changes are saved.
- [ ] `npm run funds:validate` says `PASS — fund data is valid.`
- [ ] Zero review funds *(confirmed by the validate command).*
- [ ] Zero failed imports *(confirmed by the validate command).*
- [ ] `npm test` shows `11 passed`.
- [ ] `npm run build` finished with no `error`.
- [ ] If I deployed: `https://alcawealth.vercel.app` loads and shows my change.
- [ ] The local website is stopped (`Control + C` in the Terminal running it).
- [ ] Claude Code can now be closed.

If any box is unchecked and you do not know why, **do not deploy.** Leave it for tomorrow and ask Claude Code to inspect it.


## Saved fund lists (2E)

- Every signed-in user gets two default lists — **Commonly Used Funds** and
  **Watchlist** — plus unlimited **custom lists**, stored in the existing
  firm-scoped `watchlists` / `watchlist_items` Supabase tables (RLS enforced;
  one user can never see another's lists).
- Migration: `supabase/migrations/20260717150000_fund_lists.sql` (adds
  `type`, `note`, `fund_name`, `category`, `updated_at`, `alert_enabled`;
  renames the old "Default" list to Watchlist; provisions defaults for
  existing and new users). **Run it in Supabase SQL editor / `supabase db
  push` before deploying this feature.**
- API: `/api/lists` (GET all, POST actions createList / renameList /
  deleteList / addItem / removeItem / setNote). Duplicates within one list are
  prevented by the primary key; the same ticker may live in many lists.
  Default lists can't be renamed/deleted.
- UI: "Save to List" appears on Fund Analysis (header + Similar Funds rows),
  Screener rows, and Portfolio-builder fund results; the Saved Lists page is
  under top-nav → Tools → Saved Lists. Signed-out users get a sign-in prompt,
  never a fake save.
- Future: `alert_enabled` is reserved so SEC/news/holdings alert monitoring
  can run off these same lists.

## System Health (internal diagnostics)

- **What it is:** Settings → **System Health** — compact status cards (Healthy /
  Warning / Needs attention) for eight core systems: Fund Universe (now including
  the classifier/taxonomy self-test + static/dynamic/merged counts), Market Data (Tiingo),
  Scoring Engine, Saved Lists / Supabase, Fund Requests, Portfolio Builder, API
  Routes, and App Build. An internal diagnostic, **not** a marketing/uptime claim.
- **Where:** the checks live in `src/lib/health.ts` (server-only), the endpoint
  is `GET /api/health/system`, and the UI is the `SystemHealthSection` inside
  `src/components/SettingsTab.tsx`. It runs when Settings opens and on **Refresh
  Health**.
- **Access:** the endpoint requires an authenticated session (401 otherwise) and
  the section only renders for signed-in users — never exposed on public pages.
- **Safety:** every check is isolated (one failure returns an "error" card, it
  never crashes the response). Responses carry **safe fields only** — no API
  keys, no service-role key, no raw provider/SQL bodies, no stack traces, no user
  PII, and the saved-lists check returns **counts only**, never list contents.
  Real errors are logged server-side; the client sees a generic note.
- **Lightweight:** one probe fund (VTI) is fetched once (cached) and shared
  across the Tiingo / scoring / portfolio checks. Scoring uses already-cached peers
  only (no cold fan-out), so early after a cold start it may report a documented
  "peer data unavailable" **warning** rather than a full score.
- **App Build card** reads deployment metadata only (Vercel commit/env, never a
  shell). With no metadata (local dev) it shows a warning to verify via
  CI/Vercel.
- **Fund Requests card** (informational) shows Add Missing Fund status — see below.

## Add Missing Fund — fund requests (backend foundation)

When an advisor searches a ticker that isn't in the verified universe, they can
**request** it. The request is tracked so it can be reviewed and, later, fed into
the offline fund pipeline. **This never mutates the *static* verified universe on
its own.** (As of the Expansion Hub below, a request that Tiingo supports **and** the
classifier confidently classifies is added to the **dynamic** universe overlay —
see the next section. The `fund_requests` table + API here are the intake layer.)

- **Migration:** `supabase/migrations/20260719120000_fund_requests.sql` — creates
  the firm-scoped `fund_requests` table (same RLS pattern as saved work:
  `is_firm_member(firm_id)`, audit + `updated_at` triggers, no anon access). A
  partial-unique index blocks duplicate *active* requests per firm+ticker.
  **Run it in the Supabase SQL editor / `supabase db push` before this ships.**
- **API:**
  - `POST /api/fund-requests` — body `{ ticker }`. Normalizes the ticker (trim /
    uppercase / shape-validate → 400 on junk), checks the universe, then Tiingo,
    dedupes any open request, and records the result. Requires a signed-in
    session (401 otherwise).
  - `GET /api/fund-requests` — the firm's requests (RLS-scoped).
  - `GET /api/fund-requests/[ticker]` — one request's status + whether the ticker
    is already in the universe.
- **How a ticker flows:**
  1. Already verified → status **already_available**, returns the existing fund
     metadata, stores **no** request.
  2. Tiingo has usable data but it's not in the universe → **ready_for_review**
     (`fmp_supported=true`, `classification_status=pending`).
  3. Tiingo can't return usable data → **unsupported** with a reason.
  4. Provider unavailable / no key → **pending** (retryable — *this* is what the
     health card flags as "stuck").
- **Statuses:** `pending` · `already_available` · `fmp_supported` (reserved) ·
  `needs_classification` (reserved) · `ready_for_review` · `approved` · `rejected`
  · `unsupported`. Active (block duplicates): pending, fmp_supported,
  needs_classification, ready_for_review.
- **Inspect requests:** in Supabase → `select ticker, status, fund_name,
  failure_reason, requested_at from fund_requests order by requested_at desc;`
  (or an owner/admin can read them via `GET /api/fund-requests`).
- **Approve / add a ticker manually (today):** review the `ready_for_review`
  rows, add the good tickers to `data/input/fund-tickers.txt`, run
  `npm run funds:classify` then `npm run funds:validate`, and commit the regenerated
  `data/generated/*`. Then mark the row `approved` (e.g. `update fund_requests set
  status='approved', admin_note='added <date>' where normalized_ticker='XXXX';`).
  A future task can automate this hand-off and wire an admin UI.
- **Health:** the **Fund Requests** card is informational — healthy for normal
  backlogs (it reports `readyForReview` / `unsupported` counts), and warns only
  when `pending` (stuck) requests exist. No Tiingo key or raw provider payload is
  ever returned by the support check.

## Expansion Hub — add funds from the website

**Where:** top nav → **Tools → Expansion** (`src/components/ExpansionTab.tsx`).
Internal, signed-in firm users only. Add Fund panel, request-status table, merged
universe counts, recently added funds, and the System Health cards.

**Migration (required before deploy):**
`supabase/migrations/20260720000000_dynamic_universe.sql` — creates the
`dynamic_funds` table (verified overlay) with firm-scoped RLS, and extends the
`fund_requests` status check with `added_to_universe`, `classification_failed`,
`failed_validation`. Run it in the Supabase SQL editor (the CLI `db push` replays
all migrations and collides with ones already applied by hand — paste this one
file instead).

**Why a dynamic overlay (not editing the JSON):** production Vercel can't safely
rewrite `data/generated/*` per request. The static generated universe stays the
**base**; verified runtime additions live in Supabase and are **merged
server-side** (`src/lib/universeServer.ts` → `getMergedUniverse` /
`getUniverseCounts` / `findMergedFund`). Wired into `/api/universe`, `/api/screen`,
`/api/funds/[ticker]`, and the Health/Expansion counts. Duplicate tickers prefer
the static base record.

**Add-a-fund flow (`POST /api/fund-requests`):**
1. Normalize (trim/upper/shape → 400 on junk).
2. In the **merged** universe already → **already_available** (returns metadata,
   stores nothing, links to Analyze).
3. Else Tiingo support check: unsupported → **unsupported**; provider down/no key →
   **pending** (retryable).
4. Supported → **classify** with the shared pipeline rules (`src/lib/classify/`):
   - confident + taxonomy-valid → stored as a **verified dynamic fund** →
     **added_to_universe** (screenable/analyzable/save-able immediately; merged
     count ticks up).
   - rules can't confidently place it → **needs_classification** (held, not added).
   - produced a non-taxonomy value → **failed_validation**. Classifier threw →
     **classification_failed**. **Nothing is ever added on a guess.**

**One classifier, no forks:** the rules live in `src/lib/classify/core.js`
(CommonJS) and are imported by BOTH the offline pipeline
(`scripts/classify-funds.mjs`) and the runtime wrapper `src/lib/classify/index.ts`.
Overrides + taxonomy are the same JSON files the pipeline uses.

**Statuses:** `pending` · `already_available` · `fmp_supported` (reserved) ·
`needs_classification` · `ready_for_review` (used only when no runtime classifier
is wired) · `approved` · `rejected` · `unsupported` · `classification_failed` ·
`added_to_universe` · `failed_validation`.

**Permissions:** any signed-in firm user can submit and see the firm's requests
(RLS via `is_firm_member`); verified dynamic funds are readable by any
authenticated user (one shared internal universe). Auto-add happens only when Tiingo
support **and** classifier validation pass — users can't bypass validation.
owner/admin/member roles exist for future review/reject controls.

**Health:** Fund Universe card shows `static / dynamic / merged` counts (dynamic is
a live `COUNT`, never hardcoded) and runs a classifier + taxonomy self-test —
**error** (red) if the classifier/taxonomy is broken. Fund Requests card warns
(yellow) when there are `pending`, `needs_classification`, `failed_validation`, or
`classification_failed` items; normal review backlog stays green.

**Folding dynamic funds into the static base (periodic maintenance):**
1. List them: `select normalized_ticker from dynamic_funds where verified order by created_at;`
2. Add those tickers to `data/input/fund-tickers.txt`.
3. `npm run funds:classify` → `npm run funds:validate`, commit the regenerated
   `data/generated/*`, and deploy the static baseline.
4. Optionally delete the now-static rows from `dynamic_funds` (the merge prefers
   the static record regardless, so leaving them is harmless — they just stop
   being counted as "dynamic").

**Known limitation:** a brand-new dynamic fund is screenable and analyzable, but
**peer-relative scoring** (`peers.ts` reads the static set synchronously) and the
per-fund peer rank on the Analysis page stay limited until the fund is folded into
the static base. The screener still scores it within its category group inside the
filtered result set.

## Advisor Hub — alerts, SEC monitoring, command center

- **Top-right account** shows the profile name (first+last → display_name →
  email prefix → "Advisor") over **"Personal Workspace"** — no email-based or
  fake firm/role labels. Fed by `/api/profile`, passed to `TopNav` via
  `accountName`. Settings/Profile + Sign out unchanged.
- **Advisor Overview** is a command center (`DashboardTab` + `/api/advisor-overview`):
  personalized header + system-health chip + verified-fund count, Today's
  Attention Queue (real unread SEC alerts / fund requests needing review /
  needs-classification / unresolved CIK), Quick Actions (real routes only),
  Saved-list + Fund-universe + System-health snapshots, recent activity (honest
  empty states — no fabricated activity), with Market Pulse kept but secondary.
- **Alerts** (Tools → Alerts, `AlertsTab`): SEC filing feed, monitoring status,
  monitored saved funds, and a **Refresh SEC Alerts** button. See
  [docs/sec-edgar-monitoring.md](docs/sec-edgar-monitoring.md) for the full SEC
  monitoring design (endpoints, forms, caching/rate-limiting, alert rules,
  CIK limitations, no-fake-alert policy, what's real vs future).
- **Migration** `20260723000000_advisor_alerts.sql` — `monitored_entities`,
  `sec_filings`, `advisor_alerts` (firm-scoped RLS with INSERT-capable policies;
  unique constraints for filing + alert dedup). Apply via the Supabase CLI
  (`db push`).
- **System Health** gains a **SEC Monitoring** card: red only when
  `SEC_USER_AGENT` is missing; unresolved CIKs and "no alerts / no refresh yet"
  are informational, never errors.

## App architecture — public site vs. workspace + live fund universe

**Auth-aware root routing.** `src/app/page.tsx` is a **server component** that
detects the session before render (`getServerAuthMode` pattern via the Supabase
cookie + `lynx_preview`): anonymous → the public homepage; signed-in →
**Advisor Overview immediately** (no marketing flash, no extra click). It passes
`resolveInitialTab(authMode)` (`src/lib/authView.ts`) into `RootClient` →
`AppShell` (`initialTab` prop). Public marketing pages (`/about`, `/security`,
`/contact`, shared `MarketingPage`) detect auth server-side and swap **Sign in →
Return to Workspace** (→ `/`, still signed in). The workspace nav's **About ALCA**
opens the public homepage without signing out.

**Canonical merged fund universe — single source of truth.**
- **Server:** `src/lib/universeServer.ts` (`getMergedUniverse`, `getUniverseCounts`,
  `findMergedFund`) = static generated universe (`src/lib/universe.ts`) + **verified**
  dynamic funds (`dynamic_funds`, `verified=true` only, deduped — static record
  wins on a duplicate ticker; fails safe to static if Supabase is unavailable).
  Used by `/api/universe`, `/api/universe/count`, `/api/screen`,
  `/api/funds/[ticker]` (static-first + merged fallback), `/api/recommend`,
  `/api/recommend/from-fund`, `/api/replace`, `/api/portfolio/select`,
  `/api/compare`, and the Advisor-Overview + System-Health counts.
- **Client:** `src/lib/universeClient.ts` (`useMergedUniverse`) renders the static
  base instantly (no flash) then overlays `/api/universe` (server-merged), shared
  across all consumers via a module cache, revalidated when stale (30s) or via
  `refreshMergedUniverse()`. Used by Research → Screen Funds (count + style-box
  cell counts + box totals), the hub fund search, the model ticker typeaheads,
  and the projection holdings validator. `ExpansionTab` calls
  `refreshMergedUniverse()` after a fund reaches `added_to_universe`.
- **Cache/revalidation:** `/api/universe*` are `no-store` (always live); nothing
  writes repo JSON at runtime; dynamic funds stay in Supabase. **When users see a
  newly verified fund:** immediately in the same session (Expansion invalidates
  the shared cache), and on any later Screen-Funds mount / after 30s staleness
  elsewhere — no redeploy or hard refresh required.
- **Previous stale cause:** client components imported the *static* `UNIVERSE`
  directly for counts/search, so they were frozen at build time even though the
  server already merged dynamic funds. Fixed by routing every client universe
  read through `useMergedUniverse`.
- **Known limitation:** `equityShare` (model handoff) still resolves via the
  static `findFund`; a brand-new dynamic fund inside a handoff portfolio is
  skipped from that rough equity-share estimate until folded into the static base.
