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

## What herdr offers (v0.9.5, verified)

herdr has a control mode for programmatic clients: `herdr terminal session control <pane|terminal|agent> --cols N --rows N`
(a single writable controller; `--takeover` replaces the current one) and `herdr terminal session observe` (read-only, any number of observers).
Verified against herdr 0.9.5 with a live Claude Code pane:

| Need | herdr control mode | Result |
|---|---|---|
| Live output | stdout: NDJSON `{"type":"terminal.frame","encoding":"ansi","full":bool,"width","height","seq","bytes":<base64>}`, then `terminal.closed` | First a full frame, then incremental frames. These are herdr's ANSI redraw of the pane, not the child's raw bytes, which is fine for xterm.js |
| Byte-exact input | stdin: `{"type":"terminal.input","bytes":<base64>}` (also `text`) | Works, including ESC sequences |
| Absolute size | `--cols/--rows` at start, then `{"type":"terminal.resize","cols":C,"rows":R}` | The child's real PTY follows (60×15 verified). It returns to the herdr layout size on release |
| Scroll / mouse | `terminal.scroll`, `terminal.mouse {action, button, column, row, modifiers}`, `terminal.release` | Documented; not yet exercised |
| Create / close | socket API `pane.split`, `tab.create`, `workspace.create`, `pane.close`; events `pane_exited`, `pane_closed` | `pane_exited` carries no exit status. Omnigent's own `program_status.py --state-file` wrapper already records it, independent of the backend |
| Capture | `pane.read {source: visible / recent / recent_unwrapped, strip_ansi: false}` | Good enough for idle detection and exit snapshots |
| Agent state | native detection and integrations | This is the point of the backend |

Known limits from the herdr tracker: control mode does not forward host appearance (light/dark, mode 2031; herdr #5158). Only
one controller can resize at a time, and other clients see the size it chooses; a passive "watch at the desktop size" mode is
a feature request (herdr #6095).

## Options

**A. Status quo plus a herdr launcher (no Omnigent change).** tmux stays. herdr shows the tmux client; agent detection is unreliable.

**B. Herdr backend on control mode (recommended).** A `TerminalBackend` interface, with tmux as the default and herdr as the second
implementation. The control bridge keeps its design and swaps transport: tmux `-C` `%output` becomes herdr `terminal.frame`,
`send-keys -H` becomes `terminal.input {bytes}`, and `resize-window` becomes `terminal.resize`. The processes live in real herdr panes, so herdr's native
detection, notifications and restore apply.

## Proposal

1. **Refactor only (no behaviour change):** extract a `TerminalBackend` protocol from `TerminalInstance` and the control
   bridge (create, stream, input, resize, capture, close, exit status). tmux stays the only implementation, and the existing tests prove
   nothing changed.
2. **Herdr backend** behind `terminal.backend: herdr` (default `tmux`), used only when `HERDR_ENV=1` and the herdr socket
   is reachable; otherwise fall back to tmux. One `terminal session control` process per browser-attached terminal.
   Capture and lifecycle go through the socket API.
3. **Follow-ups with herdr** (feature requests, not blockers): an exit status on `pane_exited`, a passive viewer size
   (#6095), and appearance forwarding (#5158).

## Open questions

- Should the herdr pane be created in the caller's workspace/tab (CLI launch from a herdr pane) or in a dedicated
  workspace per Omnigent project (server/runner launch)? A proposed setting is `terminal.herdr.placement: caller | project`.
- How do sandboxing (`bwrap` / `seatbelt`) wrappers compose when herdr, not Omnigent, owns the process tree?
- herdr restore after a restart: resume through the harness's native `--resume`, coordinated with Omnigent's session id.

## Testing

- Phase 1: the full existing terminal test suite, unchanged.
- Phase 2: run the terminal contract tests against both backends, using a fake herdr socket server for CI and a real herdr locally.
