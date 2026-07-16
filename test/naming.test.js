import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// NOT `import.meta.dirname`: that landed in Node 20.11, and this package promises
// Node >= 18 in `engines`. It is undefined on 18, so join() throws
// ERR_INVALID_ARG_TYPE and every test in this file errors. Caught by the CI
// matrix, not locally — a dev on 20+ never sees it, which is the whole reason
// the matrix tests the floor it advertises rather than just current LTS.
const here = dirname(fileURLToPath(import.meta.url));

/**
 * The product name is Marshall. The retired names must not come back.
 *
 * This exists because they DID come back — or rather, never left. The rename
 * swept the plugin's skills, but this package lived in another repo, so nothing
 * scanned it: `@builtbyberry/marshall-cli` 0.4.0 shipped "Signed in to Swarm
 * Release Manager" in the browser page a human sees after login, `SRM error` on
 * stderr, and a README carrying the retired wordmark to npmjs.com. A rename that
 * covers one repo says nothing about a second.
 *
 * Two things this checks that a `grep -rn 'Swarm Release Manager'` does not:
 *
 * 1. It is WRAP-AWARE (`\s+`, not a literal space). A wordmark split across a
 *    line break contains no single line that matches, so a line-oriented scan
 *    reports zero and reads as proof. That is precisely how the same wordmark
 *    reached the plugin's public repo.
 * 2. It scans the whole tracked tree, not the file someone thought to check.
 *
 * FROZEN, and deliberately not renamed — see the notes on each:
 *   - `state.backend: "srm"` — a value OTHER repos hold in tracked config.
 *     Renaming it would silently stop recognising every repo already opted in.
 *   - `SRM_CONFIG_HOME` — the legacy env override, still honoured on purpose.
 *   - the one test name that contrasts "Marshall not SRM", whose whole point is
 *     that the error text and the frozen value differ.
 * The rule is the distinction, not the string: text this package PRINTS carries
 * the product name; an identifier a CONSUMER holds is frozen.
 */

/**
 * Every tracked file except this one.
 *
 * This file is excluded because it is the only file that must SAY the retired
 * names in order to forbid them — its own prose would trip all three checks
 * below. Nothing else gets an exemption.
 *
 * Worth knowing how this surfaced, because it is a trap that hides itself:
 * `git ls-files` lists TRACKED files, so while this test was still unstaged it
 * silently excluded itself and passed. Committing it is what made it scan its
 * own docstring — green locally, red in CI, from an identical tree.
 */
const tracked = () =>
    execFileSync('git', ['ls-files'], { cwd: join(here, '..'), encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
        .filter((f) => f !== 'test/naming.test.js')
        .map((f) => join(here, '..', f))
        .filter((f) => statSync(f).isFile());

/**
 * Collapse every line break AND its comment-continuation marker to one space.
 *
 * `\s+` alone is not enough here, and this is not hypothetical: a wrapped JSDoc
 * paragraph reads `Swarm Release\n * Manager`, and `\s+` cannot cross the `*`.
 * A scan written for markdown (where a wrapped line continues with nothing)
 * reports a clean tree for JavaScript and is believed. Verified by mutating a
 * real wrapped wordmark into lib/store.js: without this normalisation the suite
 * stays green.
 */
const normalize = (source) => source.replace(/\n[ \t]*(?:\*|\/\/|#)?[ \t]*/g, ' ');

const tree = () => tracked().map((f) => normalize(readFileSync(f, 'utf8'))).join('\n');

test('carries no retired product name, even across a line wrap', () => {
    const source = tree();

    assert.doesNotMatch(source, /Swarm\s+Release\s+Manager/, 'retired wordmark');
    assert.doesNotMatch(source, /Swarm\s+Cadence/, 'retired wordmark');
    assert.doesNotMatch(source, /\ban\s+Marshall\b/, 'rename grammar artifact — "a Marshall", not "an"');
});

test('names no stale MCP tool shape', () => {
    // The plugin's connection is named `marshall`, so its tools resolve as
    // `mcp__plugin_marshall_marshall__*`. `mcp__srm__*` is a shape no host
    // exposes — 0.4.0's README pointed people at it on npmjs.com.
    assert.doesNotMatch(tree(), /mcp__srm__/, 'stale tool shape');
});

test('uses the uppercase SRM wordmark in prose nowhere', () => {
    // Until v0.14.0 one test named "...says Marshall not SRM" to encode the
    // product-vs-backend contrast, and this scan exempted it. Widening
    // state.backend removed that test, so the exemption described a place that no
    // longer exists — dropped rather than left as vestigial prose. The backend
    // value itself is the lowercase literal "srm" (guarded above); the uppercase
    // wordmark has no remaining legitimate use.
    const offenders = tracked().filter((f) => /\bSRM\b/.test(readFileSync(f, 'utf8')));

    assert.deepEqual(offenders, [], `SRM in prose: ${offenders.join(', ')}`);
});

test('the frozen identifiers survive — renaming them would break real repos', () => {
    const config = readFileSync(join(here, '..', 'lib', 'config.js'), 'utf8');
    const credentials = readFileSync(join(here, '..', 'lib', 'credentials.js'), 'utf8');

    // A consumer's tracked .claude/release-config.json holds "srm" as a value —
    // it may be WIDENED (v0.14.0 added "marshall") but never DROPPED, or every
    // repo already opted in stops being recognised. This asserts "srm" is still
    // in the accepted-backends set; it fails the moment "srm" leaves it.
    assert.match(config, /OPTED_IN_BACKENDS = new Set\(\[[^\]]*'srm'/);
    // The older env override, still read as a fallback.
    assert.match(credentials, /SRM_CONFIG_HOME/);
});
