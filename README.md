# Chessball

A turn-based football board game with formations, dice, special teams, and computer opponents. The Rules dialog describes the game's custom rules.

Matches save automatically in this browser. After refreshing or returning, choose **Resume Game** to restore the latest position, dice, player controls, and move history. Replacing a saved match from the resume screen requires confirmation. Saves stay on this device; clearing browser storage removes them.

Save compatibility is versioned in `src/ui/saved-match.ts`. Increment `RULESET_VERSION` when a rules change would resolve recorded actions differently, so older matches receive an explanation instead of silently changing during replay.

## Development

Use Node.js 26 (see `.nvmrc`) and its bundled npm. The maintenance baseline was verified with Node 26.8.1 and npm 12.0.2.

```sh
nvm use
npm ci
npm run dev
```

If you do not use nvm, install Node 26 directly. Keep development and preview servers on localhost; expose them to a trusted LAN only when deliberately testing another device. Deploy the generated `dist/` directory using a static host, rather than running a development server in production.

Build tools are development dependencies, so include them when installing on your build host. `allowScripts` approves only the locked esbuild installation script; review that entry when upgrading esbuild. Do not remove optional dependencies: the compiler and bundler install platform-specific binaries.

## Checks

```sh
npm test
npm run build
npm audit
npm run simulate -- --games 2 --seed 17 --json
npm run simulate -- --audit --pairs 1 --seed 17 --max-actions 5000 --json
```

The matched audit runs four games per seed group. These small commands check execution; they do not establish gameplay balance. Engine tests use Node, while UI tests explicitly use jsdom. Workers are limited to two to bound memory use. The few full simulation/bootstrap tests have longer timeouts to allow their existing workloads to finish on shared runners.

For larger formation studies, use `npm run audit:formations -- --mode screen|followups|all` (choose one mode) or `npm run audit:expansion`. The expansion study runs 28,800 games and is intentionally excluded from routine CI.

## Browser smoke checks

After building, start these in separate terminals:

```sh
npm run preview -- --host 127.0.0.1 --port 4177 --strictPort
```

```sh
chromium --headless --disable-gpu --remote-debugging-port=9224 --user-data-dir=/tmp/chessball-browser-smoke about:blank
```

Use your Chrome executable instead of `chromium` if needed. Keep the debugging port local and use a temporary browser profile. Then run:

```sh
npm run test:browser
```

The smoke suite checks the built app at 320, 390, 768, and 1440 pixels: page overflow, menus, rules dismissal after scrolling, appearance/field settings, kickoff, exact board/dice restoration after refresh, phase-specific commands, and New Game cancellation/confirmation. It fails on browser errors. Override `CHESSBALL_PREVIEW_URL` or `CHESSBALL_CDP_HTTP` to use different local ports. Stop both processes when finished. The old playbook verification script forwards to this suite.

GitHub Actions runs the clean install, tests, build, simulation, dependency audit, and Chromium smoke checks on pushes and pull requests. Chromium emulation does not replace testing on real mobile devices or other browser engines.

`internal/` holds the local assessment and evidence and remains gitignored.
