import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

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

const tracked = () =>
    execFileSync('git', ['ls-files'], { cwd: join(import.meta.dirname, '..'), encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
        .map((f) => join(import.meta.dirname, '..', f))
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

test('uses SRM in prose nowhere but the one place that contrasts it', () => {
    const offenders = tracked().filter((f) => {
        const body = readFileSync(f, 'utf8');
        const hits = body.match(/\bSRM\b/g) ?? [];
        if (hits.length === 0) return false;
        // The sole legitimate use: a test asserting the error says Marshall while
        // the frozen backend value stays "srm".
        return !(hits.length === 1 && body.includes('says Marshall not SRM'));
    });

    assert.deepEqual(offenders, [], `SRM in prose: ${offenders.join(', ')}`);
});

test('the frozen identifiers survive — renaming them would break real repos', () => {
    const config = readFileSync(join(import.meta.dirname, '..', 'lib', 'config.js'), 'utf8');
    const credentials = readFileSync(join(import.meta.dirname, '..', 'lib', 'credentials.js'), 'utf8');

    // A consumer's tracked .claude/release-config.json holds this literal.
    assert.match(config, /backend !== 'srm'/);
    // The older env override, still read as a fallback.
    assert.match(credentials, /SRM_CONFIG_HOME/);
});
