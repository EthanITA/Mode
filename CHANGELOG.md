# Changelog

Versions are the number in `.claude-plugin/plugin.json`. That number is not only bookkeeping: it
names the directory a marketplace install unpacks into, so bumping it is what makes an update land
somewhere new rather than on top of the old copy.

This project is pre-1.0, so a minor bump carries new contracts and behaviour, and a patch bump
carries fixes. Nothing here is stable enough to promise otherwise yet.

## 0.18.1

### Removed

- **`hooks/relay.ts`**, which told Claude a sidecar delivery was Marco's when the sidecar's mod was not
  loaded. The mod now ships in the same plugin as the sidecar that sends those deliveries, and strips the
  marker itself, so the hook never had anything left to read.

## 0.18.0

### Removed

- **The sidecar moved to its own repository, [cela-sage/sidecar](https://github.com/cela-sage/sidecar).** The
  Nuxt app, its CLI, the Electron shell and their tests left this repo, so installing mode no longer pulls
  in Nuxt, Electron or the 24 direct dependencies around them, and `pnpm install` here fetches TypeScript, `@types/node` and Prettier
  alone. The sidecar installs as a plugin of its own and still runs `mode forget` on a removed conversation.
  `tsconfig.plugin.json` is now the only config and is named `tsconfig.json`, and `pnpm typecheck` and
  `pnpm test` cover what `typecheck:plugin` and `test:plugin` did.

## 0.17.0

### Added

- **`mode forget --session <id>`** deletes every state file mode holds for a conversation that is gone,
  which is what the sidecar runs when you remove one.
- **Two surfaces, chosen in `sidecar setup`.** `sidecar setup` asks whether to run the sidecar as a desktop
  app or as a webapp in Chrome and remembers the choice, prompting on first run (or `sidecar setup desktop|web`).
  Desktop builds and packages a small Electron app around the same sidecar and opens it, where a Web artifact
  is a real top-level Chromium page rather than a framed one, so Gmail, Reddit and anything that refuses framing
  work, with the comment layer, pins and Ask Claude drawing over it as before. On first launch it copies your
  Chrome cookies into its own session, decrypting them with a key read once from the login Keychain, so you
  arrive signed in, and `sidecar import` re-reads them later. `sidecar open` honours the chosen surface, and
  `sidecar uninstall` removes the desktop app and all its data. The shell is `desktop/`, its own pnpm package,
  so Electron is downloaded only when you build the app. A fresh Google sign-in and passkeys are still refused
  inside any embedded browser, with Open in Chrome in the View menu as the way out.
- **Sign-in opens as a sheet in the window.** On the desktop surface a site's own OAuth popup, Continue with
  Google and the like, opens as a card centred over the page with the rest dimmed rather than a separate OS
  window, and it stays a real child window underneath so the opener survives and the sign-in still completes.
  Close it with its own button or by clicking away. Google may still refuse a from-scratch sign-in inside an
  embedded browser, where Open in Chrome remains the way out.
- **Every link in the chat opens as a Web artifact.** A web address you or Claude write in a conversation,
  outside code, lands in its Artifacts once, the same entry clicking it in the sidecar makes, as it is said
  and with the New artifact toast, whichever conversation is on screen. One said while the sidecar was
  stopped lands quietly once it is back. A link you remove stays removed however often it is said again, and
  a page a WebFetch or WebSearch brought back stays out even when Claude cites it, unless you write it
  yourself.
- **Hand-rolled styling is flagged as it is written.** `token-guard` reads what a Write or Edit adds to a
  `.vue` or `.css` file and names each raw colour, duration, `cubic-bezier` curve, arbitrary Tailwind
  bracket holding a px, rem, ms or hex value, and raw type, radius or spacing size, pointing at the token
  or utility the design system already has. Token definitions, keyframe animations, reduced-motion resets,
  `var()` fallbacks, generated files and a design system's own stylesheets pass, and a line that really
  has no token says why in a `no token` comment.
- **Open a URL live, with the comment layer.** The Open a URL field in Artifacts, or `artifact open <url>`,
  shows any local app or website in the sheet through a proxy on this machine that injects the comment
  agent, so a block takes a thread, Ask Claude and the tray the way an artifact's does, and Claude answers
  with `artifact comments`. A Web artifact is a tab, and every one is a tab of the same browser: Open a URL
  always makes a new one, and inside it links, redirects, forms, scripts and the address bar go to any
  site in place. Every site gets one host of its own under the sidecar's, the same in every artifact, so a
  site's cookies are shared by its other hosts, its cross-site scripts and their CORS answers load, as
  reddit's did not before, and a sign-in, a solved captcha or anything a site stores carries from one Web
  artifact to the next and lasts across conversations and browser restarts. Text that isn't an address
  searches Google. Open a URL and the address bar show the typed site's favicon, with a spinner while it
  is fetched, Google's G for a search, or a globe when the site has none.
  `artifact open <url>` and a link clicked in the sidecar reuse the conversation's artifact already on that
  address. A thread names the whole address it was left on, a thin bar under the header runs while a page
  loads, hovering a Web entry offers to remove it with Undo, no site can navigate the sidecar window
  itself, and a page reaches no host closer to this machine than its own, as Chrome's Private Network
  Access draws it, so a remote site can't call localhost, the local network or the sidecar's API. Back and
  forward arrows, ⌘[ and ⌘], step through the artifact's own history across every site and never the
  sidecar's, each artifact keeps that history in its record so it survives a switch or a reload, a reload
  button after the arrows does what ⌘R does, and ⌘L edits the address. A reCAPTCHA checkbox and its
  picture challenge work inside a Web artifact, so the "unusual traffic" check Google gives a browser it doesn't know can be passed there.

- **Fullscreen is three islands over the page.** F, from the sidecar or inside a live site, grows any artifact to the whole window
  under a strip of islands: the list button on the left, which lays Artifacts or Files over the left edge
  to switch without leaving fullscreen, the title in the middle, and Comment, the theme and Exit on the
  right. A live site's title island carries the arrows, its favicon, title and host, and open in a browser
  tab, and clicking the title edits the URL in place. The top bar, the board and the dock step aside, and
  Esc closes comment mode before it leaves fullscreen, from the sidecar or inside a live site.

- **A live site's threads sit beside their blocks.** On the face they dock in a gutter at the sheet's
  right edge headed by the page and its thread count, and the frame narrows to make room. Grown, each
  card floats on its own beside its block on a short tether, and leaving fullscreen docks it again.

- **Links open in Artifacts.** A link anywhere in the sidecar, in a page, a rendered file, a live site, a
  note, an answer or the code editor, opens there instead of in a browser tab: a web address as a Web entry,
  a local `.md` or `.html` as a File entry listed beside the pages, with its threads kept beside the file
  rather than in it, and any other file in Files. A relative link reads against the file it sits in, a mail
  link still leaves, and the href stays real so Copy link gives it.

- **A live site follows the sidecar's theme.** Light or dark reaches the page through the frame's
  `color-scheme`, so `prefers-color-scheme` answers with the sidecar's choice, and a `data-theme` on its root.

- **Ask Claude, `/btw` from the sidecar.** The session's mascot sits beside the notes, hovering it slides its
  field out without taking focus, and ⌥↵ or a click puts the cursor there to ask a side question with the whole conversation as context, the running turn
  included, and nothing reaches the transcript. The mascot acts out the session's status, hopping under a
  "!" while it waits on you and asleep once it's gone, apart from the side chat's state. The exchanges
  stack in one scrolling thread that Clear empties with Undo, asking works on a finished conversation, and
  Send to session turns an answer into a real turn. `POST /api/sessions/<key>/ask` serves it.

- **Quick ask from a comment.** The comment popover on lines in Review's diff, lines in Files, and a
  block of an artifact gets Ask (⌘↵) beside Add to tray. A blank Claude answers in a side question card
  under the lines or in the margin: a bare `claude -p` with none of your configuration that can only
  read files, so it looks at the code instead of quoting your rules. It has follow-ups, Resolve (⌘⌫, with Undo) and Send to conversation (⌘↵),
  which also carries what is still in the field, and the lines an answer names light up as chips you
  can click. Asks never enter the tray.

- **Claude reaches the sidecar through events, and a new artifact raises a notification.** Producers
  append typed events to `~/.claude/sidecar/events.jsonl`, and `/api/events/stream` streams them to every
  open sidecar with Kafka's offsets, so a consumer resumes where it stopped. The first topic,
  `artifact.created`, is published by `artifact new` and by the observe hook when Write creates a page in
  the artifacts folder; the sidecar shows "New artifact" with an Open that takes you to it, and the
  Artifacts list picks the page up without a reload. `sidecar publish <topic> <json>` publishes from a
  shell and `useEvents().on(topic, handler)` consumes in the app.
- **create-artifact builds pages from a component kit.** `artifact new <slug> --ds <key>` scaffolds a
  local page with the pack's stylesheets, the kit and the review layer in it, and `artifact kit <slug>`
  refreshes the kit in place. The kit is one runtime keyed on `data-cx`: a figure whose named controls
  drive steps, panes, outputs, bars and a verdict through attribute expressions, a table the reader
  searches, filters and sorts, a verdict band, folded detail, a chapter rail, the theme toggle, reveal and count-up.
  `references/components.md` is the contract and `references/components.html` runs every piece.
  `templates/interactive.html` is rebuilt on it, which also fixes its `--color-*` tokens that no pack
  defined, and `templates/showpiece.html` drops its own reveal, count-up and toggle for it.
- **A Review face, side by side, for what Claude changed since your last approval.** It reads the
  ledger the `sidecar` mod keeps in `~/.claude/turn-diff/<session>/`, a job the `turn-diff` mod did
  before it folded into `sidecar` with no window of its own in Claude Code: the original on the left, the
  disk on the right, in Monaco's diff editor with the One Dark theme the Files editor uses, Compact
  hiding unchanged regions and Wrap wrapping both sides. The files sit in a folder tree like JetBrains'
  commit view, coloured by status, with single-folder chains merged. Take a whole hunk with the check
  or the x on the seam between the sides, or approve and reject files, while selecting text in a pane
  stays a plain selection. Each press is relayed into the session, where the mod applies it and tells
  Claude about a reject, so the mod stays the only writer, and a reject of a hunk or a file opens the
  composer on it to say why. ⌘Z undoes the last approve or reject and ⌘⇧Z redoes it,
  up to 50 back, with the same pair as buttons whose tooltip names the step; the mod refuses one whose
  file Claude edited since, and tells Claude when an undo or redo rewrites a file. Comments go to the
  tray, and the comment icon in either gutter or ⌘K notes a line the way it does in Files.
  `/c/<key>?face=review` opens on it.
- **Review approves or rejects a whole folder, or one file, from its row in the tree.** Hovering or
  focusing a row lays the hunk seam's check and cross over its right end, so the row keeps its full
  width at rest and its name runs under the pill with no ellipsis. A folder's pill opens on how many
  files it decides and sends their paths in one press, which ⌘Z takes back as one step. Reject arms
  first and asks Reject 8?, the second press opens the composer to say why, and Esc disarms it. The
  sidecar mod labels a step over several files by their count and shared folder, `approving 8 files in
  .claude/hooks/`, so the undo tooltip stays one line.
- **The chat island is hidden; Claude Code is the chat.** The prompt, the transcript and the mode and
  style pickers no longer show in a conversation or on an artifact page. Notes left on a page or a line
  still collect in the tray, which shows bottom right with one button that sends them to Claude.
- **An Artifacts face lists what a conversation made: its pages and its plans.** A page is one in the artifacts
  folder and a plan is one Claude Code wrote to `~/.claude/plans/`, both newest first and each opening in the
  reader beside the list. A conversation opens on it, after Review in the switcher, and `artifact open`,
  `?artifact=<slug>` and a followed slug land here. Any other `.md` the conversation wrote stays in Files.
- **A Files face replaces the Canvas.** All is the conversation's whole folder as a tree that follows `.gitignore`,
  with a toggle that brings the ignored files back dimmed, and two narrower scopes: Produced, the
  files Claude created, and Interacted, the ones it read or changed. A dot marks every file the
  conversation touched, solid for what its latest turn read or edited. Any page the artifact catalogue
  holds, every `.html` and `.md` in the artifacts folder included, opens in `<ArtifactReader>`, the
  reader the artifact route now shares, with comments and the tray working as they do there. Its
  header carries Comment and Fullscreen, which grows the same sheet over the whole face, its shadow
  deepening as it goes and the frame never reloading, with Comment as an island beside an X, or Esc,
  that shrinks it back. A page opened at its own address carries the same islands, its X in place of the
  back arrow. A comment ring on a block
  the pane has scrolled half away stops at the pane's edge. Every other file opens in an editable
  Monaco: ⌘S saves through
  `PUT /api/sessions/:key/files/content`, which refuses a save over text that changed on disk since it
  was opened, an unsaved draft survives switching files, ⌘K, the comment icon in the gutter or
  "Note for Claude" in the context menu drops a line note into the tray, and the Note pill notes the
  whole file. The editor is always dark, in One Dark Pro with its `vivid` and `italic` options
  on, and its header takes the same palette. `.vue`, `.svelte`, `.astro`, `.jsonc`, `.toml`, `.zsh` and
  the usual dotfiles highlight through the nearest language Monaco ships, and type errors from imports
  it cannot resolve are off. The scope pills fill the sidebar's top row and drop to icons when the pane
  is too narrow for their labels, and Ignored sits on the folder's own row. The canvas face and its
  zoom control are gone from conversations; the desk still uses the canvas.
- **The left pane of Files, Review and History resizes.** Drag its edge, or focus the edge and use the
  arrow keys, and double-click to reset. Every face shares one width (340 by default), so resizing it in
  Files carries over to Review, History and Artifacts, capped at half the face so a width kept from a
  wider window never squeezes the other pane.
- **Review's right pane is editable, and the left stays read-only.** ⌘S saves through the same hash-guarded
  endpoint as Files, so a turn that changed the file in the meantime is never overwritten; the diff
  refreshes after a save, an unsaved edit survives switching files, and while one is open ⌘Z undoes
  the edit and the hunk arrows wait. A deleted file and History stay read-only.
- **History diffs between turns, side by side.** Pick a turn to see what it did, shift-click another
  to see what the turns between did together, or read through to the newest version. Each file draws
  in `<DiffSideBySide>`, the same Monaco diff Review uses, read-only here, as tall as its lines up to a
  cap and built only once its card scrolls near, from a `pair` the version store hands over whole
  (`GET /api/sessions/:key/versions/pair`).
- **One file tree for every face.** `<FileTree>` draws any `TreeSource`: `useFolderTree` lists a folder
  a directory at a time as it opens, with git deciding what is ignored, and `usePathsTree` lays out a
  fixed set of files with single-folder chains merged. Files uses the first, Review the second.
- **The sidecar listens to Claude Code.** Home no longer shows the desk: it says it is listening to a
  Claude Code session and jumps to the one Claude Code points it at, and every conversation page
  follows the next point. The `sidecar` mod points it: `/sidecar` in a conversation, which starts the
  sidecar when it is down and opens it only when no page is listening, and typing in a conversation's
  prompt. `POST /api/follow` takes the point, with an optional `face` to show there, and
  `/api/follow/stream` carries it. While a page listens the sidecar also reads Terminal's front tab
  title once a second and moves when that tab switches to another conversation, so a `/sidecar` point
  holds until you switch. Following and the jump palette replace the page rather than push it, so Back
  never walks through every conversation the sidecar followed. The head carries only the conversation's
  name, where the link back to the desk was, and the desk itself moved to `/desk`. ⌘K means comment
  everywhere: an editor notes its selection, a picked block opens its edit, and anywhere else it arms
  the comment picker, so it no longer opens the jump palette.
- **The sidecar installs as an app, at an address of its own.** `nuxt dev` serves it on port 4747, read
  at `http://sidecar.localhost:4747`, which Chrome resolves to this machine with no hosts file, so it
  shares neither a port nor an origin with whatever else runs on `localhost:3000`. A web app
  manifest, icons and a title bar colour that follows the sidecar's theme make it installable from Chrome
  as a standalone window with its own Dock icon, and `/sidecar` launches that app when it is installed,
  else a Chrome app window, else the default browser. `node tools/icons/render.ts` redraws the PNG
  icons from their SVGs.
- **`bin/sidecar` opens, starts, stops, restarts and installs the sidecar, and `/sidecar` is that
  CLI.** Bare `sidecar` opens it the way `/sidecar` always did: started when down and pointed at the
  conversation, then a sidecar window already open in Chrome comes to the front, even one still
  reconnecting after a restart, and a new window opens only when there is none. A page whose follow
  stream a restart closed opens it again by itself. `status` says whether it is up. `stop` takes
  down a sidecar wherever it was started, a terminal's `pnpm dev` included, and leaves another app on
  the port alone. `install` makes it a launchd agent that starts at login. `/sidecar <args>` runs
  `sidecar <args>` in the session and shows what it printed.
- **"you are dispatcher." takes a pinned default, and the dispatcher runs in `fast`.** A contract that
  sets `enter-over-pin` may take a slot that only holds a pin, judged on the prompt's opening sentence
  so a prompt that merely talks about it never switches, and a slot typed by hand stays out of reach.
  A mode's `style:` puts its own style in place whenever it is entered unless the conversation typed
  one. `dispatcher` carries both, with role phrases such as `you are dispatcher` in place of the bare
  word `dispatcher`, which fired on any prompt that mentioned it.
- **Every ask has a north star.** Each mode declares in its front matter what it can deliver, `pair`
  and `ic` anything, `studio` and `tester` an artifact, `dispatcher` nothing, and the ask in hand
  narrows it with `mode deliverable change "the retry fix merged"`, or Jev reads it from the prompt when
  nothing is named. How far a change ships is the project's `delivery` row, a commit when none matches,
  overridable per ask with `--ship`. The hook restates it every turn, a third status chip shows it, and
  `deliverable-guard` refuses an edit before one is named and any edit, commit, push, MR, publish or
  post outside it. Opening an MR and stamping an artifact mark their part delivered. `mode deliverables`
  prints every mode against how a change ships where you stand, then every project's row. A mode that
  declares nothing is untouched by all of it.
- **`dispatcher`, an eleventh mode for a batch of requests.** It splits the batch, grounds each request
  just far enough to triage it, and every request ends as one of three outcomes: a new conversation in
  `~/Notes` on Sonnet at xhigh effort, told to spawn an Opus medium `director`, a relay to the live
  session that already holds it, or an answer here when a look settles it. `mode triage` gives each
  request Jev's reading first, two yes-or-no questions and a match against every live session, in one
  line and one 3 s call, silent without an OpenRouter key. It writes every prompt itself
  in the user's voice, never waits on a reply, delivers nothing of its own, and titles its conversation as
  the dispatcher rather than after any request. It is read-only, and
  `router-guard` now denies `Write`, `Edit` and `NotebookEdit` for it as it does for `swarm`, with a
  subagent call left alone. It needed an eleventh chip colour, so `violet` joins the palette. Nothing can
  switch a running session's model or effort, so when the lead is not on Sonnet at high effort the line
  confirming the switch asks the user to type `/model sonnet` and `/effort high`.
- **`pair`, a tenth mode and the new default.** Claude keeps its hands on the whole loop and hears two
  views built to differ. A teammate named `director`, spawned once per conversation on Opus,
  whatever model Claude runs on, with no edit tools, owns the outcome as design director,
  product director or tech lead, and is briefed with pointers rather than conclusions so it forms its
  view from the work itself. Claude Code's `advisor` tool, when the session has one, reads the whole
  transcript and checks the method against the evidence. What to build, scope, taste and the sign-off
  go to the director; approach, evidence, being stuck and receipts go to the advisor. Both weigh in at
  `plan?` and at `review?`, after verification and before any commit, with the director's brief never
  carrying the advisor's view. On a split over direction the director's answer stands, and a sign-off
  never stands in for the user's yes. `ic` is now the same loop without the director and no longer
  calls itself the default. A fresh slot still starts empty, so making `pair` the default is
  `cd ~ && mode mode pin pair`.
- **Two guards hold `pair` to its own contract.** `director-guard` denies the director any write, spawn,
  board item or git write over Bash, keyed on the name it was spawned under, read from its meta file
  beside the lead's transcript, since a named teammate can keep tools its type would drop.
  `pair-guard` denies the lead a commit over 30 changed lines, or `review-lines` in the config, until
  the director has answered after the lead's last edit.
- **Human prose outranks every mode, style and skill.** A contract's reminder is restated every turn
  while a ground rule is told once, so a contract that asked for another register won by repetition.
  A rules file can now declare `outranks: contracts`, and its own `## Standing reminder` is restated
  on every turn, last, after the mode's and the style's, under a line saying it wins wherever they
  disagree. `prose` carries the flag and a four-line reminder, and `mode why` lists it.
- **A tenth chip colour, `orange`.** ANSI 256-colour 208, the first code outside the sixteen, because
  the unused brights (91, 92, 93, 96, 97) sit too close to red, green, yellow, cyan and grey to read
  apart, and the sidecar already paints `orange` in a tint no other mode holds. The ten modes hold
  all ten colours again, so an eleventh mode means an eleventh colour.
- **The sidecar's home page shows the conversations `claude agents` shows, and deletes them the same
  way.** The list used to be built from whichever sessions had left an artifact list behind, which on
  this machine meant 89 rows against the agent view's 9. It now takes its set from
  `claude agents --json --all`, cached for one poll, so the names and the lane each conversation sits
  in are the CLI's own rather than something re-derived; reading the job files directly is a fallback
  for a machine with no CLI, and a lane that came from there is marked as derived. Everything the
  sidecar kept but no background job owns is still returned and still reachable by link, flagged
  archived and folded behind a toggle in the header.
- **The home page is a canvas.** Conversations are cards on the same pannable, zoomable plane the
  session canvas uses, arranged where you drop them, with the layout held in this browser rather than
  in the conversation. Each card carries a thumbnail of that conversation's own canvas, drawn from the
  placement it saved, or nothing when it never saved one. Double-click opens it.
- **A conversation can be deleted from the sidecar.** The card's context menu asks a second time in
  place, the way `claude agents` wants ctrl+x twice. It stops the worker before it removes anything,
  and gives up rather than escalating if the worker will not stop, so a live one is never stranded.
  It removes the job directory and the six places the sidecar keeps per-session state. It never
  touches the transcript, the file history, or a document that a conversation's artifact list merely
  points at, and it refuses outright on a job running in worktree isolation.

- **The sidecar's board writes Claude Code's task store directly.** Ticking a task complete, adding
  one, or reassigning it in the Board panel now writes the task file itself, stamped
  `#id [CATEGORY] subject` exactly as a `TaskCreate` would be, and sends nothing to the chat. The
  agent learns what moved from one line of injected context on its next `PostToolUse`,
  `UserPromptSubmit` or `SessionStart`, so a board edit costs it no turn and never arrives looking
  like something the user typed. Ids are claimed the way the harness claims them, highest plus one
  and written only if absent, so the two writers cannot collide. The drag order is a webapp-only
  preference kept outside the task store, where the agent never reads it.

- **`board-cap` bounds open USER work on the board.** It guards `TaskCreate` and `TaskUpdate`, denying
  past the cap and naming the alternative: fold the work in, or take the default and proceed.
- **The chat panel parses an assistant turn's X/Y/Z read into its own panel**, tinted apart from the
  rest of the answer and open by default, so the read Marco actually wants first is not buried inside
  the prose. A turn without one renders exactly as before.
- **The chat panel takes a `compact` mode.** Over the artifact page it now starts as a narrow closed
  pill instead of a full-width, half-height block; focusing the prompt or new assistant activity opens
  it, and it never auto-closes once open.
- **Code is syntax highlighted**, in History's and the artifact page's diff rows (by the file's own
  extension), in a `.md` artifact's fenced code blocks (by the fence's language), and now in the chat
  panel's own fenced code blocks too. One shared util, `Syntax` (`shared/utils/highlight.ts`,
  re-exported from `app/utils/highlight.ts` for the client), wraps `@speed-highlight/core` and maps
  its token classes onto the app's own light/dark theme colours rather than a bundled theme, so it
  reads like the rest of the sidecar in either mode.
- **One guard can be turned off without the rest.** `"disarm": ["board-check"]` in
  `~/.claude/mode/config.json` silences only the guards it names, by file stem, where `"guards": "off"`
  still turns every one of them off.
- **A git switch or checkout stops before it carries someone else's work to another branch.**
  `git-guard` denies it while the checkout holds uncommitted changes to files the session never
  edited, and says to park them with a named stash first.
- **A shell command can't destroy what the session doesn't own.** `delete-guard` reads each Bash command
  the way the shell and the tool would, following `cd`, variables, loops, subshells and `bash -c`, and
  denies `rm`, `rsync --delete`, `find -delete`, `git clean`, `reset --hard`, a `checkout` or `restore` of
  paths, `mv`, `cp` or `ln` over a file, or a truncating redirect when it would take the filesystem or home
  root, a whole git working tree, another session's job folder, more than 50 tracked files, or an untracked,
  ignored or uncommitted file the session never wrote. It lists `find` and `git clean` matches with their own
  dry runs, and reads rsync with openrsync's option grammar, so an option that swallows a path is caught
  before a one-operand `--delete` mirrors a scratch folder onto the current directory. What it can't see,
  such as an unknown variable or `xargs rm`, is denied too. The session's `$CLAUDE_JOB_DIR/tmp` and build
  output like `node_modules` stay free.
- **Following Claude Code switches pages under a loading veil.** When the sidecar moves on its own,
  from a conversation to Listening, from Listening to a conversation or between two conversations, a
  blurred veil fades over the page, the page changes underneath it and the veil lifts once the new one
  has rendered. Claude shows up on it only when the new page is slow, and a switch you start yourself
  stays instant.
- **Select any text to ask Claude about it.** Selecting words in an artifact, a Files preview, a live Web
  page, the code editor, a Review or History diff or a past version's diff shows an Ask Claude chip at the
  end of the selection, and clicking it or pressing ⌘K opens the comment popover quoting exactly those
  words. Where the surface has nowhere to show an answer the chip reads Note for Claude and adds to the
  tray. In comment mode a drag selects and a click still picks the block.
- **Review can list the files under `.claude/jobs`.** A jobs chip in the To review header, like History's
  changes only, adds what Claude writes in its job folders, which Review leaves out with the rest of
  `.claude`. It is off by default.

### Changed

- **`artifact` knows only pages and recorded documents.** `artifact list`, `path`, `url`, `touch` and
  `stamp` no longer see Web artifacts or files a link opened, which are the sidecar's, so the status line
  stops showing Web artifacts. The `artifacts` key in `~/.claude/mode/config.json` is gone, and
  `NOTES_ARTIFACTS` is the one way to move the folder, read the same by the sidecar.
- **The sidecar announces a new page itself.** It watches the conversation lists in `~/.claude/artifacts/`
  and toasts a page the first time a conversation records one it was not already showing, so
  `artifact new` and the observe hook no longer publish `artifact.created`. The observe hook now records
  every page Write or Edit touches in the artifacts folder against the conversation, where before only
  `artifact stamp` did. A page made while the sidecar is stopped lists when it starts, without a toast.
- **Comments and opening a page moved to the sidecar CLI.** `artifact comments <slug>` is now
  `sidecar comments <slug>`, with the same `--reply`, `--resolve`, `--json` and `--ingest`, and
  `artifact open <slug|url>` is now `sidecar open --artifact <slug|url>`. The `user` key that names who
  left a comment moved from `~/.claude/mode/config.json` to `~/.claude/sidecar/config.json`, carried over
  once. `artifact` keeps scaffolding, stamping and `review`, which installs the layer.
- **The sidecar keeps its own list of conversations.** It used to find past conversations by reading
  mode's session state, so the list now comes from `~/.claude/sidecar/conversations/`, where the sidecar's
  Claude Code mod leaves one empty file per conversation as it takes a turn. Removing a conversation in
  the sidecar runs `mode forget` for mode's share of it, and `/api/sessions` no longer carries each
  session's mode, style and pipeline, which nothing read. Conversations listed before this are carried
  over once from mode's state.
- **Comment mode lights the paragraph under the pointer, not its whole wrapper.** A pick is the
  innermost block that owns the words, holding ⌥ takes the box around it such as a whole card, and
  crossing the gap between two paragraphs keeps the last one lit. Blocks inside an artifact's or a Web
  page's own iframes pick and select too, and an embed from another origin picks as one block. Wrappers
  are still indexed, so a thread left on one before this keeps its place. The banner says ⌥ widens, and
  pressing or releasing ⌥, or holding C to arm, re-lights the block under a resting pointer at once, with
  no need to move the mouse.
- **The sidecar is styled with Tailwind and Cela's tokens.** Every component's scoped style `@apply`s
  Tailwind and `@cela/design` utilities in place of about 3,700 hand-written declarations, and every size,
  radius and colour is an existing token, so text sits on Cela's `typo-*` scale (12.5px text is 13px now),
  radii on `rounded-field` and Tailwind's scale, and a Surface's own radius is no longer overridden.
  `sidecar.css` registers the sidecar's colours and the faces' split layout in `@theme` and its shared
  helpers as `@utility`, and what stays raw is what no token can say, such as keyframe animations and SVG
  geometry. Prettier sorts the classes, `tools/mascot-states.ts` compiles the mascot's style before
  inlining it, and `rules/code-style.md` asks the same of every Tailwind project.
- **Pages, live sites and rendered files share one comment layer, the page artifact's.** A picked block
  opens the same popover everywhere, and its notes float over the page's inline end once the sheet is
  grown or the page has its own address, with the page kept clear of them. A live site drops its notes
  column for it and narrows its frame rather than padding a site it doesn't own, and a Markdown or HTML
  file previewed in Files takes block comments too, kept in the tray against the file, with F growing the
  Files sheet so they show. Edit shows only on a page it can rewrite, and every pick carries the artifact
  it was made on, so a note no longer lands on whichever one another face held last.
- **The sheet's header carries the fullscreen title before it grows too.** A page or a live site opens
  under the same centred title it has in fullscreen, a live site's with its arrows, favicon, title, host
  and open in a browser tab, and only Comment and Fullscreen sit at the right, so the path line, the
  labelled buttons and the reload button leave the sheet and ⌘R still reloads. The title sits flat in the
  header and turns into a glass island only once the sheet grows, so it never reads as one more of the
  app's islands. Growing and shrinking keep the one header, so an address being typed in it survives the
  switch.
- **Growing and shrinking the sheet move as one.** The app's islands and dock fade out of the way, the
  header's buttons fade and scale into the fullscreen islands and back, the title's flat fill crossfades
  into glass and the sheet's border eases away, all while the sheet travels, and a page's notes fade in
  where they land. Reduced motion still snaps.
- **Tooltips draw above everything.** Every tip opens in the browser's top layer, so a live site's frame,
  the next button along or a clipping pane no longer covers it, and it goes once its control fades out.
- **Faces stay as you left them.** Artifacts, Review, Files and History each stay mounted behind the
  others once opened, so switching back fades the face in with nothing read again, and a list says it is
  reading until its data lands instead of saying it is empty.
- **Loading shows a spinner, not the mascot.** The cover between Listening and a conversation spins the
  favicon's loader once a switch runs slow, and the sidecar's first load shows the same loader on the
  theme's own canvas, so a dark sidecar never starts white.
- **Picking another page, file or turn never flashes.** A loading line waits a beat before fading in,
  so a quick read never shows it. Another artifact no longer blinks "could not be read" or the last
  page's versions while it loads, Files keeps the last file up until the next one lands, and History's
  diffs fade in where "Reading…" was while turns already read stay instant.
- **Artifacts rows show their kind as an icon.** A Web artifact shows its site's favicon, a `.md` the VS
  Code Markdown mark and an `.html` page its `<>`, in place of the Web, Page and Plan chips, and a row's
  title and every toast stop at two lines.
- **The sidecar opened at plain localhost moves to sidecar.localhost.** A site in it opens on a
  subdomain of the sidecar's host, and under plain localhost that frame is cross-site, so no login stuck.
  Theme, pane width and the other settings the sidecar keeps in the browser start over once.
- **comment-guard challenges every comment an Edit adds.** Two short notes per edit no longer pass
  quietly, and a comment the edit only carries over from `old_string` no longer counts, so a short
  one-liner that restates the code gets flagged the moment it lands.
- **Leaving a conversation in Terminal sends the sidecar to Listening.** When Terminal's front tab
  switches to one with no conversation in it, or the conversation in it exits, the page goes to
  Listening, and coming back to the same conversation opens it again. A Terminal that could not be
  asked counts as no change. A conversation opened by hand or pointed at by `/sidecar` still stays put
  until the front tab switches.
- **Review leaves out `.claude` files.** Plans, job scratch, artifacts and config under a `.claude`
  folder never show in the Review face, so Approve all and Reject all never touch them either.
- **A sidecar that opens shows the conversation in front in Terminal.** Opening the app, reloading or
  coming back on a restored page reads Terminal's front tab first, and goes to Listening when no
  conversation is there. Whichever came last wins, a `/sidecar` point or the front tab switching after
  it, so the app `/sidecar` launches opens on what it pointed at, and a switch made while the sidecar
  was closed still counts because the front tab is read when the point is made. Before, an opening page
  went to whatever was pointed at last.
- **A session waiting on a permission prompt or a question reports `waiting`.** `/api/sessions` used to
  drop that status to nothing, so a client reading `status` sees a third value beside `busy` and `idle`.
- **Every key the sidecar shows is a keycap, and only in the one tooltip under the pointer.** A tip
  writes its shortcut as `{cmd K}` so it shows inverse caps, as in "Comment on anything · ⌘K or hold C",
  and no screen draws a cap inline anymore. A key sits in the tip of the button it presses, and a key
  with no button, such as ↑↓ in a list, ↵ in a field or esc on the comment banner, sits in a tip on that
  list, field or surface, which opens on hover and never while you type. The key legends under the Desk,
  the jump palette, Ask Claude, the comment popover, the edit panel and an adrift thread are gone, and
  `app/utils/keycaps.test.ts` fails when a component mounts `UiKbd` again.
- **Listening and the Desk follow the Sidecar design.** Home waits for Claude Code under a breathing
  Listening tag, offers to resume the last conversation, lists the three ways to point the sidecar and
  links to the Desk, a link that goes quiet with a tooltip when no other conversation exists. The Desk at
  `/desk` is a centred list instead of a canvas of cards: the conversations `claude agents` lists, the
  ones ready for review or needing input first, each with its tint, its age and the job's one-line status
  (`detail` on `/api/sessions`, read off the job's state file). ↑↓ and ↵ open one, esc or the Back island
  returns, and right-click still deletes. The archive toggle, card previews, badges and Tidy up are gone,
  so a conversation `claude agents` no longer lists is reached through the jump palette, and
  `/api/sessions` no longer carries the `preview` the cards drew. When the server
  stops answering, every route shows the Reconnecting screen over a page that stays mounted underneath,
  in place of the banner by the composer, and it offers no conversation, Desk link or way to point it,
  since none of them work without the server.
- **Every mode and style contract keeps every rule in about two thirds of the words.** The eleven modes
  went from 113k to 75k characters and the six styles from 33k to 25k, each body small enough to share
  one hook with a switch line, the pipeline position, the deliverable and an outranking reminder, which
  a contract test now enforces. Front matter and standing reminders are unchanged.
- **A mode and a style switched on one prompt never spill to a file.** When the two whole contracts
  would outgrow one hook, the mode's goes now and the style's arrives with the next prompt, under a
  line saying so. Entering `dispatcher`, which also sets `fast`, is the case that needed it.
- **The ground rules and the held contracts arrive at session start, each part under the hook cap.** Four
  new `SessionStart` hooks, `start/rules-1`, `start/rules-2`, `start/mode` and `start/style`, each carry
  one part with Claude Code's whole 10,000-character budget, so the first prompt no longer runs over the
  cap and hands Claude a file to read. They fire again on a resume, a clear or a compact, which re-arms
  everything before the next prompt instead of on it, so `resume` no longer clears the announced markers.
  A session whose start hooks never ran still gets the ground rules on its first prompt.
- **A held contract goes out once, and again only when it changes.** The prompt hook no longer restates a
  mode's or a style's standing reminder every turn: an unchanged turn carries only a pipeline position or
  deliverable that moved, plus the outranking rule's reminder. A switch arrives as "The mode switched from X
  to Y. The X contract no longer applies", then the whole new contract, and a slot turned off arrives as a
  line saying so. A resume or a compact still re-arms the whole contract. In measured sessions the
  per-prompt repeat was about 800 tokens, and every copy stayed in context until the next compaction.
- **A ground rule already loaded as memory is not injected again.** List its stem under `memory` in
  `~/.claude/mode/config.json`, such as `"memory": ["prose"]` for a prose rule a CLAUDE.md imports, and the
  first prompt skips its body while its `outranks` reminder still comes from the file every turn.
- **The notes column shows only on a routed page or a fullscreen sheet, and ⌘↵ sends the notes.** On a face
  the sheet is too narrow for it, so notes stay in the tray until the page grows. ⌘↵ does what Send notes to
  Claude does, unless a note box already took the keystroke to save.
- **The sidecar app keeps shared state in Pinia.** Stores are `$<name>()` and composables stay `use<Name>()`.
  A store in `app/stores` is written `export const $artifact = defineStore(() => {...})` and the build
  (`app/utils/define-store/`) injects the id `artifact` from the variable, so the name is written once; an explicit id still wins.
  It is used as a plain Pinia store: `const artifact = $artifact()`, then `artifact.isFull = true` and `artifact.open()`.
  The first is `$artifact`, holding the fullscreen flag and replacing the `useArtifactFullscreen` composable;
  the other `useState` flags move as they are touched.
- **`artifact open` shows the page in the sidecar, not the browser.** `artifact open <slug>` points the
  sidecar at the conversation and shows the page in Artifacts. The browser is still `artifact open <slug> --browser`,
  or `--web` for the published URL, and `sidecar open --artifact <slug>` and `POST /api/follow` with a `slug`
  do the same from outside.
- **create-artifact no longer opens the page it built.** It hands over the path and stops, and the artifact
  rule says the same, so a finished page opens only when you run `artifact open <slug>` yourself.
- **What the sidecar sends a session opens on `[[sidecar]]`, and a Review press is just its JSON under it.**
  `[[cc-sidecar]]` and the inner `[[turn-diff v1]]` are no longer sent, and `[[cc-sidecar]]` and
  `[[mode-relay v1]]` are still read in older transcripts. A conversation started before this update runs the
  old sidecar mod, which reads neither, so restart it before pressing anything in Review.
- **The Review file tree drops its trailing labels.** The `T3 T5` turn tags on files and the file count
  on folders are gone, and a line down the left of each open folder wraps its children instead.
- **The sidecar keeps its data under `~/.claude/sidecar/`.** The server log is `server.log` there, History's
  versions moved from `~/.claude/mode/versions/` to `versions/`, and the Review ledger is written to `review/`.
  A review already begun in `~/.claude/turn-diff/` is still read from there and carries on in it, and the
  existing versions were moved by hand, so a machine with older ones needs
  `mv ~/.claude/mode/versions ~/.claude/sidecar/versions`.
- **Artifacts live in `~/.claude/sidecar/artifacts` by default, instead of `~/artifacts`.** `NOTES_ARTIFACTS`
  and the `artifacts` key in `~/.claude/mode/config.json` still override it, and the CLI and the sidecar now
  resolve it in one place. A machine on the old default either runs `mv ~/artifacts ~/.claude/sidecar/artifacts`
  or sets the key to `~/artifacts`.
- **The deliverable guard only counts a page directly inside an `artifacts/` folder as an artifact.** Code
  under a folder of that name, such as `server/api/artifacts/`, is an ordinary change.
- **Mode runs on Node alone.** python3 and jq are no longer needed, and Node 24 or newer is. Every
  hook, `bin/mode`, `bin/artifact` and the create-artifact scripts are TypeScript run by node, and a
  hook reads mode state in process instead of starting `bin/mode`, so the prompt hook went from about
  330ms to about 35ms. The installer edits `settings.json` through `bin/_install.ts`, the generated
  `statusline.sh` pipes its JSON into `chips.sh`, which hands it to `bin/mode chips --stdin`, and
  `chips.sh` finds the plugin in `installed_plugins.json` with node. A `statusline.sh` written by an
  older installer still calls jq, so re-run `./install.sh --force` if you remove jq. The plugin's
  own suite is `pnpm test:plugin` and its typecheck `pnpm typecheck:plugin`.
- **The theme switch is one island in the top right of every route and face,** beside the other
  islands, and no view carries its own copy. It themes the whole sidecar, and the page inside the
  frame follows it. Comment sits with the page, as a pill in its Files header and as an island when it
  is fullscreen or open on its own. Comment, the theme switch, Fullscreen and X are one
  `<ChromeAction>`, a pill in a bar or an island in the top row, so each keeps one icon, one tooltip
  and one motion wherever it shows.
- **The board and the notes float over the faces,** which now run to the bottom of the window, the
  counter above Send notes is gone, every island is liquid glass, and the faces read Files, Review,
  History.
- **A delivery from the sidecar reads as what Marco wrote.** The sidecar marks what it sends
  `[[cc-sidecar]]` instead of `[[mode-relay v1]]`, and the `sidecar` mod takes it out of Claude Code's
  peer envelope before it lands, so the "Another Claude session sent a message" lines never reach
  the conversation. `hooks/relay.ts` still reads both markers, for a session running without the mod.
- **A note sends Claude a short quote.** The lines or block it is about travel cut to one line of 160
  characters, since Claude reads the file itself, and the composer shows only the first three lines
  of a long selection.
- **`edu` explains things the way a friend who knows the subject would.** It used to call prose the
  expensive medium, gloss every term, and close every explanation on a three-to-five-line recap, all
  of which its reminder repeated every turn against the prose rule. It now talks in the first person
  and in connected sentences, keeps the top-down order without the labelled skeleton, explains a new
  term in passing, draws what has shape, and ends on the one thing to keep, said once. `debug`'s
  explainer and `studio`'s register lost their gloss-every-term lines for the same reason.
- **The `prose` ground rule is written from how colleagues type to each other at work.** It came out of
  setting human messages beside an agent's in the same threads. It now asks for the fact that settles a
  question and nothing after it, a quote of the words it disagrees with, agreement kept to one word,
  yes or no first on a yes-or-no question, your own take unfiltered when you are convincing someone or
  saying how something feels, thoughts joined with "because" and "so" under light punctuation, one
  word kept for one thing, the user's own voice on anything sent under their name, chat replies to
  the user laid out to scan with spacing, bold and small tables and bullets only for parallel items,
  while messages to others stay plain paragraphs, and
  no colon or parentheses standing in for a banned dash. The
  `prose-check` hook's rewrite hint stopped suggesting those two as the substitute.
- **Parentheses can hold an aside again, and the `evidence` rule says confidence the way `prose` does.**
  The prose rule had limited parentheses to an id or a path, which the artifact register's own good
  example broke. A dash still can't become a colon or parentheses. The evidence rule listed confidence
  as four categories that read as the labels the prose rule bans, so it now asks for the verb on the
  claim itself.
- **Files fullscreen shrinks back faster than it grows,** and every transition timing on a mounted
  surface reads a `@cela/design` token instead of a number.
- **Tooltips come from `@cela/design`.** Once one has shown, the next along a row opens at once, and
  each opens away from the nearest window edge.
- **Every face says empty, loading and failed the same way,** through `@cela/design`'s
  `StateMessage`: one sentence-case line where uppercase mono and sentence case used to mix, and a
  failure is announced.
- **Lines that are still working sweep, and the desk's running bar and the listening dot breathe.**
  Both come from `@cela/design` and go still under reduced motion.
- **Toasts leave upward and the lane closes up behind them.** A toast used to vanish in one frame and
  the ones below it jumped. The lane stays mounted while empty, so the first toast is announced too.
- **A toast's Undo is an icon.** Clearing side questions and removing a Web entry offer Undo as an arrow
  where the word used to be.
- **A saved note lands beside its line, and the notes column snaps open.** The column used to tween its
  width, which re-wrapped the page and moved every mark on every frame.
- **Moving between Terminal tabs no longer sends the sidecar to Listening.** A front tab with no
  conversation in it leaves the page where it is, and the sidecar switches only when a conversation is
  detected, in front or pointed at by `/sidecar`.
- **The sidecar's controls come from `@cela/design`.** Buttons, badges, initials marks, warning banners,
  approve and reject, the zoom stepper and the Files scopes are the design system's own components, so
  they press, squash and tint the way Cela's do, the main action is the gradient pill, and every tooltip
  is a design tip. The dark editor bars remap the palette to One Dark, so the same components sit on them.

### Removed

- **`rules/code-style.md`, and the installer step that linked it.** A code standard is personal, so it now lives in
  each user's own `~/.claude` rather than shipping with the plugin. The comment, null and namespace guards carry
  their rule text themselves and enforce exactly as before.
- **The board island.** Hidden on the conversation and artifact pages, the only ones that showed it, so its
  components, the `/api/sessions/:key/board` routes, the board helpers behind them and the `board-island`
  render-check region are gone.
- **The Canvas face.** The Files face replaced it, so its components, the `/api/sessions/:key/canvas`
  routes and the canvas types are gone.
- **The chat island.** Hidden since Claude Code became the chat, so the dock, the mode picker, the
  transcript and the question options are gone, and the session perch keeps only its mascot.
- **`/api/why` and `/api/contracts`.** Nothing has called them since the tab rail and the pipeline strip
  went, and `mode why` on the CLI is unchanged.
- **The delivery receipt.** `board-deliver` (the warning on ticking a delivery-shaped item), `board-done`
  (the stop check that re-opened an all-ticked board whose receipt failed), the `metadata.done` receipts
  they verified and the `delivery` config rows are gone, so ticking an item no longer runs `glab` or
  `git`. A stale `delivery` key in `config.json` is ignored, as is `DELIVER_MODE`.
- **The deliverable.** `mode deliverable` and `mode deliverables`, the `deliverable` ground rule,
  `deliverable-guard`, the `deliverables:` front matter key, the status-line chip and the
  `Deliverable:` line in the injection are gone, so an edit, a commit, a push or a post is no longer
  held to a named north star. The `delivery` config rows stay, since `board-deliver` still reads them.
- **`artifact wait` and the page's local sink.** The review layer sends Send and Approve to the
  sidecar relay, and with no sidecar running it downloads `<slug>.comments.json` for
  `artifact comments` to pick up. `artifact review --sink` goes with it, and a page built by an
  older layer still pings port 7391, which now just fails and falls through to the download.
- **The python hooks.** `hooks/*.py`, `hooks/guards/*.py` and `hooks/sync.sh` are gone, since every
  hook runs from its `.ts` beside them. A session opened before 0.17.0 still calls the python files
  and has every guarded tool call blocked once they are missing, so restart it after updating.
- **Starting at login through launchd.** `sidecar install`/`uninstall` and the `~/Library/LaunchAgents`
  plist are gone; the sidecar starts when you run `sidecar`, `/sidecar` or `open`, which brings it up when
  it is down. `sidecar uninstall` now removes the desktop app and all its data instead, and `sidecar desktop
  install|import|uninstall` became `sidecar setup`, `sidecar import` and `sidecar uninstall`.

### Fixed

- **A folded Ask Claude takes clicks only on itself.** The empty strip beside it, the whole width of the
  dock, swallowed every click meant for the page underneath, so the bottom of a Web artifact could not be
  clicked. Only the island, the Send pill and the tray chips take a click now.
- **A claude.ai artifact loads in a Web artifact.** Its sandbox frame reached claude.ai as a top-level page,
  so claude.ai sent it back to itself and showed Couldn't load artifact. A frame a site makes inside its
  page now reaches the site as a frame, while the Web artifact's own page still reads as a browser tab.
- **Continue with Google works in a Web artifact.** Google's sign-in popup was told the proxy's address as
  the site's origin and answered Error 400, and its answer could not have reached the page anyway. A
  page's own address in a request now reaches the site as the site's real one, and the popup and the page
  that opened it hear each other at the addresses they expect.
- **A Web entry's domain stays on one line in the Artifacts list.** A long one wrapped under its icon and
  now truncates.
- **The sidecar stops flooding `/api/why`.** Every five-second poll asked for the why of every listed
  conversation, close to 300 requests a tick, for a tab rail nothing renders anymore, so the poll and
  the screen's gate and ground rule counts it fed are gone.
- **The five-second poll asks for live conversations only.** It fetched every conversation on disk, about
  330 KB and 170ms of server work a tick with three hundred of them, and now asks for the running ones,
  the jobs and the one on screen, about 28 KB in 16ms, while the full list loads once with the page.
- **Gmail and the Google Store open from google.com.** The proxy sent each request marked as a framed
  page with the sidecar as its referrer, which Google's sign-in answers with a 401, and a form posted to
  the site's own or another of its hosts, such as the consent page's, left the proxy for a 403. Requests
  now go out as a browser tab's, forms and redirects stay on the proxy, a link clicked inside a site opens
  where it points, and all of a remote site's hosts share one cookie jar. A remote entry opened before
  this starts with fresh cookies once, because its proxy origin is now named after its site.
- **Google's cookie consent sticks.** A site's calls to its other hosts, such as consent.google.com, go
  through its proxy, so the cookies they set land where the site reads them.
- **A live page shows as soon as it is parsed.** The sidecar held a site behind its full load, which on
  Storybook meant its own slow preview, and the loading line now sits centred instead of over the page.
- **Switching faces keeps a live page loaded.** Artifacts stays mounted behind Files, Review and History
  once opened, so a site comes back with its scroll and sign-in as you left it, and its F, ⌘R and Esc
  stay quiet while another face is up.
- **Switching apps no longer sends the sidecar to Listening.** While another app activates, Terminal
  reports a hidden tabless window, or another of its windows, as the front one for a moment, and a read
  landing there left the conversation. The read now skips hidden windows, and a front tab change counts
  only once it still holds 300ms later.
- **Listening opens the conversation it offers to resume.** Pointing the sidecar at the last
  conversation, from Terminal, `/sidecar` or typing, left the page on Listening, because it took that
  conversation for the one already on screen. Now it opens it like any other.
- **Edit on an artifact block and Ask AI on a note run through Claude Code.** They called the Anthropic
  API and failed without `ANTHROPIC_API_KEY` in the sidecar's environment, then fell back to Gemini
  through `agy`. Now both are `claude -p` on your own login, Haiku first and Sonnet when Haiku hands
  the instruction over, so nothing outside Claude Code needs setting up. When neither answers, the toast
  says why, such as not being logged in or Claude Code not being installed.
- **Fenced code shows in answers, turns and notes.** Every fenced block rendered as an empty box,
  because the highlighter read the fence's text as a string while Vue holds it as an array.
- **Artifacts and Files open what this conversation picked, not the last page opened anywhere.** Each
  conversation keeps its own pick, so switching to one that never made a page opens its own first page
  or nothing. Before, the page last opened in any conversation stayed open in every other one.
- **A restarted sidecar opens a conversation only when one is in front in Terminal.** When the server
  goes down the page now leaves for Listening and shows Reconnecting there, so once the server is back
  it opens whatever conversation is in front and otherwise stays on Listening. Before, the page waited
  under the Reconnecting cover and came back on the conversation it was showing.
- **Notes beside an artifact push its content, not the page.** The page keeps its full width and its own
  background runs under the notes column, while its content reflows clear of the notes. Before, the
  whole page narrowed and the notes sat on the sidecar's background beside it.
- **`artifact review` and `artifact kit` no longer list a page as the conversation's own.** Refreshing
  the layer or the kit is upkeep, so a conversation that refreshes many pages no longer shows them all
  in its Artifacts face. `artifact new` and `artifact stamp` still record the pages a conversation builds.
- **Review shows the folder its files share, so files from one folder get a tree too.** The shared
  folder used to be left off the top, which made a review of files from a single folder a flat list.
  The switcher now reads Review, Files, History.
- **A Claude Code started without node on PATH no longer turns every hook off.** The hooks, `bin/mode`,
  `bin/artifact` and `bin/sidecar` use the node on PATH first and otherwise the one `install.sh` now
  records in `~/.claude/mode/node`, so run `./install.sh` once after updating.
- **A pipeline step reads what the call printed, not only how it exited.** A suite piped into `tail`
  that went red counts as red, one that could not load its tests counts as nothing, a `git commit` that
  had nothing to commit is not a commit, and `git -C <dir> commit`, `node --test`, mocha and python test
  files are recognised. `/approve` now passes an `@approve` step, which nothing recorded before.
- **Buttons at the bottom of Review, Files and History clear the floating Board and Send pills.**
  Undo, Redo and Reject all sat under the glass once the islands began floating
  over the faces.
- **The server banner follows every poll.** It used to show only when the first load failed and then
  stay; now it appears when the server stops answering, says it is retrying, and clears with
  everything reloaded once the server answers.
- **The tray copy says what happens.** Toasts and threads promised a note "sends with your next
  turn", but only Send notes sends it, and they now say so. The thread's queued resolve reads "Ask
  Claude to resolve".
- **A comment already sent to Claude never rides the next send.** It used to stay in the tray after
  sending and go out again with every later note; now it is marked sent, keeps its pin on the page,
  and leaves the count and the handover. Answering a comment's thread queues the answer on its own,
  so Send notes comes up for it.
- **Line notes from Review reach Claude with their file and lines.** The tray's handover only carried
  the quoted text before.
- **An artifact fetch that resolves late no longer replaces the one picked after it.**
- **The version store keeps what a turn writes after the store last looked.** A build in the middle
  of a turn counted that turn as done, so its later writes never reached History; each build now
  writes the last turn it saw again, which adds versions only for what changed since.
- **A `.gitignore` the conversation wrote no longer hides its other files from the version store.**
  The store mirrors every touched file into its own git repository, the ignore file included, so a
  rule like `/projects/*` dropped whole folders from History. The store now adds past ignore rules.
- **A conversation that has written nothing no longer breaks the version store.** Its first build
  read the log of a repository with no commit and failed.
- **History's panes scroll instead of squeezing.** Each pane is a flex column, so a turn whose files
  overflowed shrank every card to fit; the cards now keep their height and the pane scrolls.
- **`board-check` no longer points at an X/Y/Z read that may not be there.** Its message said the board
  goes up straight after the read, which only happens while the `xyz` style is held. It now says the
  board goes up before the first action.
- **The artifact prose register points at the live `prose` rule.** It named `~/.claude/rules/prose.md`,
  a path that stopped existing when the rule moved into this plugin.
- **The chat panel no longer replays a flash of "thinking" on reload.** A page load replayed a
  finished exchange through the same timers a live stream uses, so a reload showed the mascot land on
  the answer, flip back to "thinking" for a couple of seconds, then show the answer again at a
  different width. The composable now settles a dangling turn immediately when the session is not
  busy, so a reload renders the final state once.
- **The mascot's reserved space no longer collapses when it teleports.** Its perch in the transcript
  was mounted only while a beat was active, so settling could tear down the whole row — including the
  answer's layout — for the ~2s hand-over animation. The perch is now a permanent sibling of the
  swapped text; only the mascot's own opacity toggles.
- **The transcript panel is shorter by default.** Its cap only ever grew with the conversation; the
  ambient single-turn preview now caps well below the full-history view, which still gets the old
  room when expanded.
- **The panel's open/closed state survives navigating between the conversation, the artifact page and
  history.** It lived in a local ref that reset to the same state on every page mount, so switching
  views always landed back on the same view regardless of what was open before. It is now shared
  state, defaulting to minimized.
- **History's default view now shows what a turn actually changed.** Selecting the latest turn
  compared its own result against itself, so "vs head" always read as unchanged even when the turn
  wrote real content; it now diffs from just before that turn's edit. A past version of a `.md` that
  already existed renders that diff too, instead of the whole document — a `.md` a turn created still
  shows the full page, since there is nothing to diff against. The rendered changes, in History and on
  the artifact page alike, now sit in the same capped, scrollable height as the chat transcript instead
  of growing without limit. A file whose baseline had to be reconstructed from git no longer shows every
  turn after its first as a full deletion: the reconstructed content only patched that first turn, so a
  later edit folded from nothing and the store read it as removing the whole file. Every turn for such a
  file now replays the full chain from that same baseline.
- **Picking a block on an open artifact opens the composer again.** The app disarmed comment mode on
  every window blur, so a held C could not leave the page swallowing clicks, but clicking into the
  artifact frame moves focus into it and blurs the app window too. The mousedown on a block turned the
  mode off and the click that followed found nothing armed. Focus entering the frame no longer counts
  as leaving the app, and a hold of C that began in the app window now ends when C comes up inside the
  frame.
- **Comment mode has something to pick in the chat and in a diff.** Arming it and clicking the reply in
  the dock, the narration of a running turn, or a changed file in History did nothing at all: only the
  board rows, the mode and style chips, the pipeline strip, canvas cards and blocks inside an artifact
  carried a target, so most of the screen ignored the click without saying so. The settled answer and
  the live beat now describe themselves the way an expanded turn already did, and a file in History's
  Changes pane picks as a whole, with its path and its churn in what Claude gets told.
- **A home canvas card no longer spills past its own box.** The card slot forced a fixed height that
  ignored its content, so a card with many badges or artifact chips overflowed onto the row below;
  the slot now grows with the card the way the canvas primitive already does for every other item.
  A card with no saved spot on first load could still land close enough to overlap its neighbour once
  it grew past that guess; the unplaced ones now settle the same way "Tidy up" packs a selection, by
  their real measured height.

## 0.16.0

### Added

- **`namespace-guard`, a fourth style guard on `Write|Edit`.** It reads the whole file after the
  edit and flags what the domain-namespace rule bans: two or more exports sharing a prefix
  (`googleLogin` beside `googleSignout`, which want to be `Google.login()`), and `export *`, which
  turns a curated index into a firehose. Verb prefixes such as `format` and `create`, and the
  `use` of a composable, are exempt because they name an action rather than a domain.

## 0.15.1

### Fixed

- **`--insert-chips` no longer appends to the interpreter.** A status line of
  `node /path/to/index.ts` has two files on the command: the Node binary, then the
  script. The installer took the first file that existed, so it wrote a shell block
  onto `node` itself and SIGKILL'd every new Node 24/26 process on that path. It now
  skips interpreters, and it refuses to edit a file that is not a shell script.

## 0.15.0

The plugin stops pointing at things it does not carry. The skills its contracts name now ship with
it, and the catalogue is smaller and sharper than it was.

### Added

- **Four skills ship with the plugin**, namespaced `mode:<name>`, with a bare `/<name>` command each
  written by the installer. `create-artifact` builds one self-contained HTML page in a named design
  system. `edge-induction` generates an edge-case checklist from a problem's structure. `design`
  carries interface craft. `showpiece-prompt` writes one-shot generative prompts. Until now the
  contracts named these and hoped the setup happened to have them.
- **The artifact CLI, `bin/artifact`**, beside `bin/mode`: slug resolution, the metadata stamp, and
  the comment round trip that lets a page be reviewed and the threads answered from the terminal.
- **`artifact ds`**, which resolves a design system through the shipped packs first and
  `~/.claude/mode/design-systems/` second, so a pack you write beats one that ships.
- **`rules/code-style.md`**, the rule the null guard already enforced, now shipping beside it.
- **`goal` mode.** Implement, verify through a channel that could disagree, then hand the diff to a
  fresh subagent to audit against the project's own bar. Any finding restarts the loop, and it ends
  only after two consecutive clean rounds.
- **`config.json` grows two keys.** `user` names the person a review comment is from, and `delivery`
  maps a path fragment to the receipt a delivery in that tree owes. Both ship absent.
- **The installer links the shipped rules into your own rules directory**, and creates
  `~/.claude/mode/design-systems/`. A path-scoped rule is not a plugin component, so Claude Code
  reads one only from there; without the link `rules/code-style.md` would ship and never load. An
  entry you wrote yourself is left alone.

### Changed

- **`prove` is gone, folded into `goal`.** Naming the channel, recording a baseline, and breaking the
  thing once to check the channel notices are all steps of the new mode, and `ic` already carried the
  discipline for smaller work.
- **`maintainer` is gone, folded into `ship`.** One style slot meant the two could never be held
  together, yet a change that goes out wants both. `ship` now carries what travels with the change,
  the blast radius, and the restraint on bumping a dependency.
- **`enter-when` phrases that misfired on ordinary asks are dropped**: `why is` and `why does` from
  `debug`, `end to end` and bare `regression` and `qa` from `tester`, bare `explore` and `think
about` from `studio`, and `make it work` from `fast`.
- **The delivery bar is read from config rather than compiled in.** It used to name one person's
  repositories.
- **`artifact open` uses `xdg-open` off macOS.**

### Fixed

- The guide embedded two diagrams for contracts that no longer exist, and the axes diagram still drew
  a grid of sixty-three combinations. Both now match the catalogue.

## 0.14.0

A contract can now outlive the conversation, refuse an edit, and explain itself.

### Added

- **Pins: a slot filled by the directory rather than by the conversation.** Both slots still die
  with the session, which is right for a contract set for one piece of work and wrong for the answer
  that never changes. `mode <axis> pin <name>` writes that answer against a directory, and every
  later conversation started inside it adopts it. Two layers resolve, mirroring the contract folders:
  `~/.claude/mode/pins.tsv` is personal to the machine, and a `.mode` file committed at any directory
  is shared with everybody who clones the repo, carrying `mode:` and `style:` lines a person
  hand-writes. Lookup walks up from the working directory and takes the first answer, so the deepest
  file wins and one package in a monorepo can differ from the repo around it; within one directory
  the personal layer beats the shared, because a machine outranks somebody else's default.
  `mode pins` prints what a fresh conversation here would begin in and which file decided each slot.
- **Three restraints that keep a pin a default rather than an override.** An axis anybody has already
  spoken for is never adopted into, and `off` counts as speaking for it, so `/mode off` in a pinned
  directory is not undone by the next message. Adoption runs once per axis per conversation, so a
  switch made after it is never reverted. A name this machine has no contract for is stepped over in
  silence and does not take the rest of its file down with it, so a repo pinning somebody else's
  private contract costs a stranger nothing. `mode <axis> pin off` writes a personal no that masks a
  shared file without editing the repo, and `--forget` drops the row so the shared one shows again.
- **A third source mark on the chip.** `=maintainer` says the directory pinned it, against
  `~maintainer` for the chooser and a bare name for one that was typed. Nobody should be held to a
  contract they cannot see they did not pick, which was already true of the chooser and is now true
  of a repo.
- **`no-code-without-red`, the hook `tdd` shipped without.** The contract carried a section titled
  "Nothing enforces this", naming the gate that was cut from v1. It exists now: a PreToolUse guard
  that refuses an edit to an implementation file while no watched failure stands. It opens on a suite
  the recorder saw exit non-zero and shuts again on the pass that closes the lap, which is why the
  ledger had to become ordered: read as a set it says a failure happened forever. The flag is on the
  front matter rather than in the code, so any contract can arm it, and the guard carries no mode
  name. It judges narrowly on purpose: only a file whose extension carries behaviour, outside a test
  directory, whose name is not test shaped. The test itself, prose, config and fixtures are never
  refused, because a rule blocking those would block the only route to a red.
- **`/why`, the report that says what is actually steering the turn.** Everything here is either a
  chip too small to explain itself or text injected where nobody can read it, so the plugin had no
  way to answer its most obvious question. It prints what each slot holds and how it got there, where
  the pipeline stands, every gate the mode declares with whether it is open right now and what would
  open it, which ground rules have been injected and which are still waiting on a trigger, and
  whether the next prompt costs the whole contract or the four standing lines. Answered inside the
  hook like a switch, so it costs no tokens and returns immediately. `/why`, `/mode:why` and
  `/mode why` are one code path; `/why fix the parser` puts the report in front of Claude and then
  runs the turn.
- **`mode red` and `mode <axis> pin`, `pins`, `adopt`, `why` on the CLI**, so the guard, the hooks and
  a person all read the same state through the one tool that owns it.

### Changed

- **The done ledger is ordered.** `declared` was a set, which cannot answer a question about a pair
  that cancels out. It is built on an ordered read now, and nothing else about it moved.
- **The dispatch gate is no longer the only mechanism**, so the README's limitations, the guide's
  enforcement table and the manual's flag paragraph now say two rather than one, and name
  `no-implement` as the gap that remains: no hook can tell a two-line seam between finished domains
  from a domain somebody decided to build themselves.
- **`/why` joins `/mode`, `/style` and `/approve`** as a bare command the installer writes, since a
  plugin cannot register an un-namespaced name.

## 0.13.0

The pipeline stops being a drawing and becomes state.

### Added

- **`mode <axis> step`.** Every mode already declared a `steps:` pipeline, but only the status line's
  bash ever read it, so the position was something a renderer derived and nothing else could see.
  `bin/mode` parses it now, reads the ledger, and answers where the pipeline stands: in prose for a
  turn to read, or as tab-separated rows for a renderer. The status line asks rather than parsing
  front matter itself, which is what stops the drawing and the injected text disagreeing.
- **The position is injected on every turn.** `announce` carries it under the standing reminder, in
  the same shape the rest of the plugin uses: the model is never remembering which step it is on,
  it gets told again each turn. The line names the step, what came before, what comes next, and the
  command that closes it.
- **`observe.py`, a PostToolUse hook that records what actually happened.** A step's `@event` suffix
  names the moment that closes it, and most of those moments are observable: asking the user closes
  a `@question` step, spawning an agent closes `@agent`, writing an artifact closes `@artifact`, a
  test run closes `@test` and a red one closes `@test-fail`, a commit closes `@commit`. Those advance
  with nobody remembering to say so. Steps with no event, four of `ic`'s seven, still need declaring,
  which is what the injected line asks for. Registered on `PostToolUseFailure` too, since that event
  is the only honest way to tell a passing suite from a failing one.

### Changed

- **A finished pipeline says so** rather than pointing at its last step forever.

## 0.12.0

Switching stops costing a turn.

### Added

- **A message that is only a switch ends in the hook.** `/mode debug`, `/mode:debug /style:edu` and
  `/mode off` now do the switch, print the chips back, and stop there. Claude Code's
  `UserPromptSubmit` hook can block a prompt, and a blocked prompt is never sent, so the turn costs
  no tokens and answers in roughly a quarter of a second instead of a request's worth of latency.
  This is what the mode commands were already reaching for: each one's body said "confirm the switch
  in one line", which is a whole model turn spent writing a sentence a script can print. The
  confirmation is the same chips the status line shows, with each held contract's summary under
  them, so what you read after switching matches what you look at while working. It closes on "Set.
  The status line catches up when the conversation continues." Claude Code redraws that line off the
  model's own reply and a turn ending in the hook never writes one, so the chips there are a switch
  behind until your next message. The line says the outcome and when the surface follows, which is
  what someone actually wants to know; `statusLine.refreshInterval` would redraw it on a timer, at a
  180 ms subprocess every interval in every open session, and is not worth that.
- **A bare `/mode` or `/style` answers with that axis's contracts.** Naming an axis with nothing
  after it is a question rather than a switch, and it is answered the way `/model` answers, by
  listing what you could pick. The slot is left untouched.

### Changed

- **The whole contract now lands on the first prompt that has a use for it.** It used to be spent on
  the turn you switched, which was usually a turn that did no work. A switch-only message leaves the
  announcement unspent, so the next real message is the one that carries the contract. Nothing
  changes for a message that switches and asks in the same breath.
- **A switch carrying real words still runs.** `/mode debug fix the parser` sets the slot and then
  goes to work, and so does a message with another plugin's command in it. The rule is whether a
  word is left over that only the model can answer, which is why an unrecognised word after the
  contract name is enough to keep the turn. `/mode:approve` is untouched and still runs a turn,
  since an approval exists to let work continue rather than to record a fact.

## 0.11.0

A ninth mode: the team, reached without a spec.

### Added

- **`swarm` mode.** Copilot's team with the spec and the approval removed, which leaves a gateway
  rather than a lead. It keeps a standing roster of owners, one per domain, held on the board so it
  survives the turn that built it, and routes each ask to whoever owns that domain. Nobody owning it
  means one gets hired, chartered by the files it takes, and there is no cap on how many. What
  replaces the approval gate is triage: an ask unclear on something that would change what gets
  built is refused in one line rather than guessed at, because with no spec there is nothing else
  standing between a wrong read and a fleet building the wrong thing. The register is close to
  silent, normally one or two lines a turn naming who got the work, and the file is explicit that
  terseness removes the narration and never the verification. One rule carries the whole design: a
  domain is a set of files no other owner writes to, which is what stops a swarm degrading into one
  agent per file. Sky chip, `no-implement` declared, no dispatch gate.
- **A ninth chip colour, `sky`.** The eight modes already held all eight colours, and no two
  contracts on one axis may share one, so a ninth mode needed a ninth name. ANSI 94, bright blue,
  distinct from `blue` on both light and dark terminals. The manual now says out loud that the modes
  have taken the whole palette again, so a tenth mode means a tenth colour.

### Changed

- **The manual's "Adding a thirteenth contract" heading loses its count.** It had already drifted by
  three, since nothing recomputes a number written into a heading. It is "Adding another contract"
  now, and the numbers that remain are the ones a reader would notice going wrong.

## 0.10.0

A seventh style, and the deliverable stops being implicit.

### Added

- **`creative` style.** The failure it exists to stop is the average answer: the first plausible
  approach, competently built, that nobody would have missed. It widens the search before anything
  gets built, asks for several genuinely different options rather than one and its variations,
  spends the boldness in one place and names what that risk cost, and keeps the rejected idea
  visible with its reason. One boundary is absolute: creativity lives in the approach and never in
  the facts, so the grounding rules bind exactly as hard here as anywhere. Pink chip, paired with
  `ic` in the colour map, since the everyday all-rounder with the imagination turned up is a pair
  that means something.
- **`deliverable` ground rule.** What lands was previously welded into each mode, which is why
  there was no way to ask for one mode's rigour with a different output. The rule names the four
  forms, chat, artifact, merge request and MVP, requires the form to be stated before it is
  produced, and routes each one: an artifact always goes through the `create-artifact` skill, a
  merge request follows the outbound-writing rules, an MVP is code that was run once for real.
  Several at once is ordinary. Whatever the form, grounding, sources, prose and scope still bind.

### Known limits

- The deliverable is routed but not pinnable: there is no slot holding it for a whole session, so
  a mode whose exit depends on its own output keeps that dependency. Whether it becomes a third
  slot, or a `delivers:` key each mode declares, is open.

## 0.9.0

The artifact rule becomes a contract about interactivity.

### Changed

- **An artifact is operated, not read.** The `artifact` ground rule grew from a theming note into
  the full contract, folding in the method from a vendor artifact skill and two of our own best
  pages. It now fixes what the reader must be able to _do_ per subject: reproduce the bug, switch
  the mockup variants, run the backend scenario, explore the real rows. Two tests decide whether it
  shipped: strip every control and see whether the page still says the same thing, then ask whether
  a reader can reach a conclusion nobody wrote into it.
- **Sources are links, not labels.** Every load-bearing claim carries a clickable receipt that
  resolves outside the page, to a repository permalink pinned at the line, an observability query
  already filtered, the ticket or the pipeline. Monospace `file:line` text is not a source.
- **No tab bars, and every visual is data-driven.** A wall of text behind five tabs is five walls
  with a nav in front, so the shape is a hero and scroll chapters, each carrying a figure the
  reader operates. Scenes are rendered from exported records rather than invented shapes.
- **Light stays the default, explicitly.** The rule now says so against any vendor convention that
  defaults to a dark showcase, and adds the standing bar against wearing another organisation's
  brand on work that is not theirs: take the method, run it on the design system the work belongs
  to.
- **Verification splits behaviour from taste.** Proving the controls work is required and is done
  headlessly; judging how it looks stays the user's, so no browser is driven for appearance.

## 0.8.2

### Fixed

- **Two commands in one prompt both land.** `/mode:debug /style:edu` set only the mode: the whole
  prompt was read as a single command, so the second command became an argument of the first,
  failed the name lookup, and was dropped in silence. The parser now splits a prompt into command
  chunks and obeys each, in any order, while a single command with words after it (`/mode ic fix`)
  is still one command. Another plugin's command sitting between two of ours is skipped rather
  than swallowing what follows.

## 0.8.1

### Fixed

- **A slash command led by `<command-message>` now switches the slot.** A real invocation reaches
  the hook as tags in no fixed order, and a plugin command leads with `<command-message>`, so the
  parser, which anchored on `<command-name>` first, saw nothing and left the slot unchanged. This
  is why `/mode:tester` silently did not switch while a differently-shaped `/style:edu` did. The
  parser now finds the command name in either tag, in either order. Restart or a new conversation
  is needed, since a running session cached the old hook.

## 0.8.0

The plugin becomes the whole system.

### Added

- **The guards.** Eleven enforcement hooks move into `hooks/guards/`: the board fences (category,
  keep, deliver, check, done), the prose fence, the comment, null and shell-write guards, the
  memory guard, and an X/Y/Z read fence that stands only while the `xyz` style is held. One switch
  disarms them all, `"guards": "off"` in `~/.claude/mode/config.json`, with absent meaning armed.
  Their messages cite the rule they enforce rather than a file on one person's machine.
- **Scoped ground rules.** A rules file may carry a `when:` pattern; it stays out of the first
  prompt and injects once on the first prompt that matches. The new `artifact` rule ships this
  way, delivering the HTML theming contract the first time a page is asked for.
- **Every mode draws its shape.** Each contract now carries a mermaid diagram of its own
  procedure, readable in the file and rendered wherever the repo is browsed.

### Changed

- **`ic` is the flagship default.** Rewritten from a thin sketch into the all-rounder contract:
  one senior contributor runs the whole loop, read, ground, build, verify, deliver, borrowing each
  specialist discipline without its ceremony, asking only the forks whose wrong guess wastes the
  task, and offering a team mode when independent domains pile up.
- **Contracts are isolated.** No mode or style names another. Each file stands alone, and
  cross-catalogue comparisons live only in the README and the manual.
- **Nobody's name.** The identity config, `mode init`, the installer's name prompt and the
  `{{USER}}` machinery are gone: contracts say "the user", and Claude already knows who that is. A
  legacy token in a user-authored contract is still substituted for compatibility.

## 0.7.0

The ground rules.

### Added

- **A third kind of file: ground rules.** `skills/mode/rules/*.md`, layered under
  `~/.claude/mode/rules/` the way contracts are. Their bodies are injected whole on the first
  prompt of every conversation, ahead of any contract, and never repeated; a resume or a compact
  re-arms them, since either drops the injected block. No slot, no chip, no palette entry: they
  are always on. A user file sharing a shipped stem replaces that rule, and an empty body silences
  it. Five ship, extracted from a working setup: an evidence bar, scope discipline, a live task
  board, collaboration defaults, and a prose register. The point is economics: a rule in a
  CLAUDE.md is paid for on every request of every session, and a ground rule costs one injection
  per conversation.
- **`mode rules`**, the command behind it. It prints once per session and exits 1 ever after,
  refuses to print at all without a session to remember by, and is re-armed by the same
  `clear --announced` the resume hook already runs.
- The installer creates the user rules directory beside modes and styles.

## 0.6.0

A sixth style.

### Added

- **`xyz` style.** Every substantive reply opens with a three-line read before any work happens:
  X what was typed, Y what was actually meant, inferred from the repo and the conversation rather
  than asked, and Z the adjacent work those two force into existence. A Z inside the topic that the
  user would ask for anyway gets done in the same turn and reported; examples are treated as
  illustration to complete, never as the spec; open questions are resolved by lookups instead of
  being handed back. Red chip, paired with `autopilot` in the colour map, since being away makes
  the read the only interpretation pass the work gets.

## 0.5.0

The clean palette, and an eighth mode.

### Added

- **`ic` mode.** Copilot with the spec step removed: the same shared intake, then Claude builds it
  himself. No spec artifact, no approval gate, no team; a real fork is asked as it appears, and the
  board is the record. A read-only search agent is fine, but the moment an agent writes code the
  contract says to offer copilot instead. It takes the new `pink` chip colour, since the eight
  modes outgrew the seven-colour set.

### Changed

- **The palette holds three shapes and nothing else: `mode`, `mode:<mode>` and `style:<style>`.**
  The skill that sat in the palette as `mode:mode` is `MANUAL.md` now, deliberately unregistered,
  and the init skill is `INIT.md` for the same reason. `/mode`, `/style` and `/approve` are small
  files the installer writes into the user commands directory, because a plugin cannot register an
  un-namespaced command. The style shortcuts moved out of the plugin too: inside it they arrived as
  `/mode:style:<name>`, so `mode sync` now writes `style:<name>.md` beside the bare files and they
  arrive as `/style:<name>`. Always-on token cost fell from about 556 to about 154 per session.
- **`ship` stands alone and carries the whole standard.** Every reference to the fast style is
  gone, and the contract now spells out the rules it holds work to: comments that say why or
  nothing, names that mean something, grouping by domain, explicit types on the exported surface,
  reuse before building, splitting a touched file that outgrew itself, tests where the risk is
  real, and one-line commits by logical group. Written out in full because an install has none of
  the private rule files the old summary leaned on.
- **The first name per axis wins.** `/mode tdd debug` holds `tdd`, and `/mode tdd tdd maintainer`
  fills each slot once. Names can arrive in any order, and a duplicate is noise rather than an
  overwrite.
- **The status line gets one chip per axis.** `mode chips` always prints two entries, `🎚` for the
  mode and `💬` for the style, with `off` in an empty slot, so the segment never vanishes and the
  spacing never jumps. The host line embeds the output raw and adds nothing.
- **The installer writes the bare commands by default** and refreshes only files carrying its own
  marker, then runs `mode sync` so a fresh install gets the per-style shortcuts immediately.

### Fixed

- **The stale-shortcut sweep is sentinel-gated.** Sync deletes only a file carrying its generated
  sentence, so a hand-written command sitting in the same folder can never be swept.

## 0.4.0

The ship and fast split.

### Changed

- **`ship` no longer means hurry.** It is the quality-shipping contract now: shipped code is code
  somebody maintains, so the style optimises for the next developer. Readability, real names,
  grouping by domain, explicit types on the exported surface, and refactoring a touched file that
  has outgrown itself. Its centre is an inner compass: a repo's habits are followed when they
  amount to a standard, and where they do not, our standard applies instead of mirroring the mess.
- **`fast` carries the economy `ship` used to.** Make it work, prove it ran, polish nothing:
  no tests, no comments, no naming care, no reuse, no weighing of dependencies. The reply rules it
  already had stay, and so do the floors, since ugly is allowed and wrong is not, and speed is
  never bought from data loss, secrets or irreversibility.
- **The trigger phrases moved with the meaning.** `just ship`, `hotfix`, `quick and dirty` and
  `make it work` now select `fast`; `ship this`, `ship it`, `get it out` and `ready to ship`
  select `ship`. A message carrying both, like "just ship it", is ambiguous on purpose and
  selects nothing.

## 0.3.0

The command palette.

### Added

- **A shortcut per contract.** Type `/mode:` and every contract is listed, rather than typing
  `/mode ` and recalling what exists. A mode is its own name and a style carries its axis, so
  `/mode:tdd` and `/mode:style:ship`. The files are written by `mode sync` from the contract
  folders, so a new contract arrives with its shortcut already in place and a deleted one takes its
  shortcut with it.
- **The hook understands the colon spelling.** `/mode:tdd`, `/mode:style:ship` and `/mode:approve`
  previously matched nothing and switched nothing, so a shortcut would have autocompleted and then
  done nothing at all. One parser now covers the colon and spaced forms together.

### Fixed

- **Two components no longer answer to `mode`.** The skill and `commands/mode.md` both carried the
  name, which put two identical entries in the palette with nothing to tell them apart. The command
  is gone and the skill keeps the name.

### Known limits

- A style's command file has a colon in its filename, which Windows does not permit, so those five
  files will not check out there. Renaming them to `style-ship.md` gives `/mode:style-ship`.
- The twelve shortcuts add roughly 250 tokens to the always-on cost of every session, taking the
  plugin from about 300 to about 550.

## 0.2.0

Two new modes, and one change to how a slot is filled.

### Added

- **`prove` mode.** Nothing is claimed to work until a channel that can disagree with you says so.
  A channel is an HTTP response, a browser, a log line, a query, a test. Reading the code is not
  one, since it is the same mind that wrote the change. The lap is name the channel, take a
  baseline, make the change, prove it after, and once per behaviour break it on purpose to confirm
  the channel actually notices. It suspends the standing rule against driving a browser, because
  driving the thing is the whole contract, and it leaves taste alone: prove the button fires the
  request, never that the spacing looks right.
- **`tester` mode.** A QA sweep that reports a verdict and fixes nothing. Six phases, and the first
  four are the ones that get skipped: name the environment, make the preconditions true, enumerate
  the surface, then generate cases from its structure rather than from memory. Only then execute,
  for real, and report. It fixes nothing on purpose, because a repair mid-sweep changes what was
  being measured and leaves a report describing a system nobody ever ran.
- **`mode axis <name>`**, which answers which axis owns a contract name. It exists so the prompt
  hook can route a bare name without keeping its own copy of what exists.
- **`mode version`**, which prints what is in `plugin.json`. This is how you check that an update
  actually took.

### Changed

- **A bare name now goes to whichever axis owns it.** `/mode maintainer` reaches the style slot
  instead of failing quietly against the mode one, which previously looked like it had worked.
- **Both slots can be set in one command.** `/mode tdd maintainer` fills the mode and the style, in
  either order. Only `auto` and `off` stay tied to the command they were typed on, since neither
  names a contract.
- **Seven modes now take all seven colours**, so every style shares its chip colour with a mode.
  The pairs that share one are pairs whose combination already means something, so two chips in the
  same colour never read as an accident.

### Fixed

- **The `mode` skill is user-invocable again.** A skill named `mode` wins the `/mode` match over a
  command of the same name, so making the skill non-invocable removed the only working path to it:
  the match landed on the skill, which then refused.
- **The command bodies no longer reference the plugin root.** It only expands when Claude Code
  loads them as a real plugin, and is empty when they are loaded as project commands.
- **The bare `/style` alias carries `disable-model-invocation`.** Without it, accepting the aliases
  during install made `/style` model-invocable when the namespaced `/mode:style` is not.
- **The plugin-root pointer is read verbatim**, so an install path containing a space survives.
- **The `/style` command no longer claims it set a style.** Since a bare name routes by ownership,
  `/style tdd` fills the mode slot, and the command was telling the model to confirm the opposite.
  It now reads what is actually held. The alias the installer writes had the same wording.

## 0.1.0

The first cut. Two slots per conversation, one holding a mode and one holding a style, both
switched by a `UserPromptSubmit` hook before the model reads the message.

- Five modes: `autopilot`, `copilot`, `debug`, `studio`, `tdd`.
- Five styles: `edu`, `fast`, `maintainer`, `native`, `ship`.
- `auto` on either slot, choosing a contract from `enter-when` patterns matched at a word boundary,
  with a hand-set contract never overridden and an ambiguous message choosing nothing.
- One real gate: `copilot` refuses to spawn a team of agents until an approval is on record.
- Status line chips, emitted by `mode chips` rather than owned, so an existing line keeps whatever
  else it renders.
- `install.sh` and an interactive `init` skill, covering the identity config, the user contracts
  directory, the status line and the short command names.
