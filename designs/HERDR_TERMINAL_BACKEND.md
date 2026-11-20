# Herdr terminal backend (design note)

Status: proposal (fork). Author: jeduden-ah.

## Problem

Omnigent runs every native-harness terminal (Claude Code, Codex, ...) in its own tmux server. Users who already
organise their work in [herdr](https://herdr.dev), a terminal workspace manager for coding agents, want those
sessions to live in herdr panes: visible next to their other work, with herdr's native agent detection
(working / idle / blocked) and herdr's restore, while still being reachable from the Omnigent web UI.

Today the closest setup is running `omnigent <harness>` inside a herdr pane. The pane then shows Omnigent's tmux
*client*, so herdr cannot see the agent process: its screen detection works only partially, and lifecycle state
reported through `herdr pane report-agent` is ignored for agents that herdr screen-detects (for example `claude`).

## What Omnigent needs from a terminal

From `omnigent/inner/terminal.py` and `omnigent/terminals/control_bridge.py` (tmux operations by use count:
`send-keys` 93, `set-option` 28, `capture-pane` 18, `load-buffer`/`paste-buffer` 21, `display-message` 11,
`kill-session` 10, `list-panes` 6, `new-session`/`split-window` 6, `resize-window` 2):

1. **Create** a terminal with cwd, environment, command and args; learn when the program exits, and with what status.
2. **Live output stream** of the raw bytes, which the control bridge forwards to xterm.js in the browser (tmux control mode `%output`),
   seeded once with a full screen capture that keeps the escape sequences.
3. **Byte-exact input** (`send-keys -H`), including ESC sequences and control bytes, plus paste of large text (buffers).
4. **Absolute size**: set the terminal to the browser's columns × rows.
5. **Capture** of the screen and scrollback, for idle detection, exit snapshots and tools.
6. **Lifecycle hygiene**: orphan reaping, lockdown options, and a session that survives client disconnects.

## What herdr offers (socket API, v0.9.5)

| Need | herdr | Gap |
|---|---|---|
| Create | `pane.split`, `tab.create`, `workspace.create`, then run a command; `pane_exited` and `pane_closed` events | No explicit exit status in the schema (to verify) |
| Live output | `events.subscribe` → `pane_output_changed {pane_id, revision}`; `pane.read {source, format, strip_ansi:false}` | **No raw byte stream.** Only change notifications plus snapshots |
| Input | `pane.send_input {text, keys[]}`, `pane.send_text`, `pane.send_keys` | Arbitrary bytes and ESC sequences need a byte or hex form |
| Size | `pane.resize {direction, amount}` (relative split ratio) | **No absolute cols × rows** |
| Capture | `pane.read` with `visible` / `recent` / `recent_unwrapped` | Good enough |
| Agent state | native detection and integrations | This is the point of the backend |

## Options

**A. Status quo plus a herdr launcher (no Omnigent change).** Keep tmux. A wrapper opens a herdr tab that runs the tmux
client. Full web fidelity. herdr shows the session, but agent detection is unreliable.

**B. Herdr backend with snapshot streaming.** A `TerminalBackend` interface, with tmux as the default and herdr as the second
implementation. The bridge repaints the browser terminal from `pane.read(strip_ansi=false)` on each `pane_output_changed`.
Native herdr detection and restore work. Browser fidelity drops: repaint instead of stream, no browser-driven resize,
limited input bytes, and no scrollback streaming.

**C. Herdr backend plus small herdr API additions (recommended end state).** As B, but herdr gains three generic features that
also help any herdr API client: (1) `pane.output.subscribe`, a raw byte stream (or herdr's own control mode), (2)
`pane.send_input {bytes_hex}` for byte-exact input, and (3) `pane.set_size {cols, rows}`, or a "detached pane"
whose size the API client owns. With those three, the bridge can keep its current design and swap only the transport.

## Proposal

1. **Refactor only (no behaviour change):** extract a `TerminalBackend` protocol from `TerminalInstance` and the control
   bridge (create, stream, input, resize, capture, close, exit status). tmux stays the only implementation, and the existing tests prove
   nothing changed.
2. **Herdr backend, option B,** behind `terminal.backend: herdr` (default `tmux`), selected only when `HERDR_ENV=1` and
   the herdr socket is reachable; otherwise fall back to tmux. Mark web fidelity as reduced in the UI.
3. **Propose the three herdr API additions upstream to herdr.** When they are available, switch the herdr backend to streaming
   (option C) without touching Omnigent's higher layers.

## Open questions

- Should the herdr pane be created in the caller's workspace/tab (CLI launch from a herdr pane) or in a dedicated
  workspace per Omnigent project (server/runner launch)? A proposed setting is `terminal.herdr.placement: caller | project`.
- How do sandboxing (`bwrap` / `seatbelt`) wrappers compose when herdr, not Omnigent, owns the process tree?
- herdr restore after a restart: resume through the harness's native `--resume`, coordinated with Omnigent's session id.

## Testing

- Phase 1: the full existing terminal test suite, unchanged.
- Phase 2: run the terminal contract tests against both backends, using a fake herdr socket server for CI and a real herdr locally.
