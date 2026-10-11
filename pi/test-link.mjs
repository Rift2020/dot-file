import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const config = dirname(fileURLToPath(import.meta.url));
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "pi-dotfiles-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, "dot files");
  const target = join(root, "agent");
  mkdirSync(source);
  mkdirSync(join(source, "extensions"));
  for (const file of ["link.sh", "apply-settings.mjs", "settings.json", "AGENTS.md", "web-search.json", "extensions/base-prompt.ts", "extensions/prompt-export.ts"]) {
    copyFileSync(join(config, file), join(source, file));
  }
  const settings = join(target, "settings.json");
  return {
    source, target, settings,
    run(destination = target) {
      return spawnSync("sh", [join(source, "link.sh")], {
        encoding: "utf8", env: { ...process.env, PI_CODING_AGENT_DIR: destination },
      });
    },
    read() { return JSON.parse(readFileSync(settings, "utf8")); },
  };
}

function success(result) {
  assert.equal(result.status, 0, result.stderr);
}

test("fresh deployment and repeated application are idempotent", (t) => {
  const f = fixture(t);
  success(f.run());
  assert.ok(lstatSync(f.settings).isFile());
  assert.equal(statSync(f.settings).mode & 0o777, 0o600);
  assert.deepEqual(f.read(), JSON.parse(readFileSync(join(f.source, "settings.json"))));
  for (const file of ["AGENTS.md", "extensions/base-prompt.ts", "extensions/prompt-export.ts"]) {
    assert.equal(readlinkSync(join(f.target, file)), join(f.source, file));
  }
  const search = join(f.target, "web-search.json");
  assert.ok(lstatSync(search).isFile());
  assert.deepEqual(JSON.parse(readFileSync(search, "utf8")), JSON.parse(readFileSync(join(f.source, "web-search.json"))));
  const before = statSync(f.settings).mtimeMs;
  const searchBefore = statSync(search).mtimeMs;
  success(f.run());
  assert.equal(statSync(f.settings).mtimeMs, before);
  assert.equal(statSync(search).mtimeMs, searchBefore);
  assert.equal(existsSync(`${f.settings}.before-dotfiles.bak`), false);
});

test("merge preserves local state and nested settings, replaces shared arrays", (t) => {
  const f = fixture(t);
  mkdirSync(f.target);
  const original = JSON.stringify({
    deviceId: "local-device", lastChangelogVersion: "local-version", httpProxy: "http://localhost:7890",
    theme: "dark", compaction: { enabled: false, reserveTokens: 12345 }, packages: ["local-package"],
  });
  writeFileSync(f.settings, original);
  // Explicitly remove runtime keys from the fixture, including when testing legacy dotfiles.
  const shared = JSON.parse(readFileSync(join(f.source, "settings.json")));
  delete shared.deviceId;
  delete shared.lastChangelogVersion;
  writeFileSync(join(f.source, "settings.json"), JSON.stringify(shared));
  success(f.run());
  assert.equal(f.read().deviceId, "local-device");
  assert.equal(f.read().lastChangelogVersion, "local-version");
  assert.equal(f.read().httpProxy, "http://localhost:7890");
  assert.equal(f.read().theme, shared.theme);
  assert.deepEqual(f.read().compaction, { enabled: true, reserveTokens: 12345 });
  assert.deepEqual(f.read().packages, shared.packages);
  assert.equal(readFileSync(`${f.settings}.before-dotfiles.bak`, "utf8"), original);
  success(f.run());
  assert.equal(readFileSync(`${f.settings}.before-dotfiles.bak`, "utf8"), original);
});

test("search settings keep machine-only keys and migrate a legacy symlink", (t) => {
  const f = fixture(t);
  mkdirSync(f.target);
  const search = join(f.target, "web-search.json");
  const original = JSON.stringify({ ssrf: { allowRanges: ["10.0.0.0/8"] }, githubClone: { clonePath: "/local/cache" } });
  writeFileSync(search, original);
  success(f.run());
  const shared = JSON.parse(readFileSync(join(f.source, "web-search.json")));
  assert.deepEqual(JSON.parse(readFileSync(search, "utf8")), { ...shared, githubClone: { clonePath: "/local/cache" } });
  assert.equal(readFileSync(`${search}.before-dotfiles.bak`, "utf8"), original);
  assert.equal(statSync(search).mode & 0o777, 0o600);
  const g = fixture(t);
  mkdirSync(g.target);
  const legacy = join(g.target, "web-search.json");
  symlinkSync(join(g.source, "web-search.json"), legacy);
  success(g.run());
  assert.ok(lstatSync(legacy).isFile());
  assert.deepEqual(JSON.parse(readFileSync(legacy, "utf8")), shared);
});

test("legacy settings symlink is migrated without writing to the repository", (t) => {
  const f = fixture(t);
  mkdirSync(f.target);
  const original = readFileSync(join(f.source, "settings.json"), "utf8");
  symlinkSync(join(f.source, "settings.json"), f.settings);
  success(f.run());
  assert.ok(lstatSync(f.settings).isFile());
  assert.equal(readFileSync(join(f.source, "settings.json"), "utf8"), original);
  assert.equal(readFileSync(`${f.settings}.before-dotfiles.bak`, "utf8"), original);
});

test("conflicting resource is left untouched before settings are changed", (t) => {
  const f = fixture(t);
  mkdirSync(f.target);
  writeFileSync(join(f.target, "AGENTS.md"), "local instructions");
  assert.notEqual(f.run().status, 0);
  assert.equal(existsSync(f.settings), false);
  assert.equal(readFileSync(join(f.target, "AGENTS.md"), "utf8"), "local instructions");
  assert.equal(existsSync(join(f.target, "web-search.json")), false);
});

test("existing extension files and a non-directory extensions path are left untouched", (t) => {
  const f = fixture(t);
  mkdirSync(join(f.target, "extensions"), { recursive: true });
  writeFileSync(join(f.target, "extensions/base-prompt.ts"), "local extension");
  assert.notEqual(f.run().status, 0);
  assert.equal(existsSync(f.settings), false);
  assert.equal(readFileSync(join(f.target, "extensions/base-prompt.ts"), "utf8"), "local extension");
  rmSync(join(f.target, "extensions"), { recursive: true });
  writeFileSync(join(f.target, "extensions"), "not a directory");
  assert.notEqual(f.run().status, 0);
  assert.equal(existsSync(f.settings), false);
  assert.equal(existsSync(join(f.target, "AGENTS.md")), false);
});

test("foreign and dangling settings symlinks are refused", (t) => {
  const f = fixture(t);
  mkdirSync(f.target);
  const other = join(f.target, "other.json");
  writeFileSync(other, "{}");
  symlinkSync(other, f.settings);
  assert.notEqual(f.run().status, 0);
  assert.equal(readFileSync(other, "utf8"), "{}");
  rmSync(other);
  assert.notEqual(f.run().status, 0);
  assert.ok(lstatSync(f.settings).isSymbolicLink());
});

test("invalid JSON and non-object settings cause no resource changes", (t) => {
  const f = fixture(t);
  mkdirSync(f.target);
  for (const content of ["invalid", "null", "[]"]) {
    writeFileSync(f.settings, content);
    assert.notEqual(f.run().status, 0);
    assert.equal(readFileSync(f.settings, "utf8"), content);
    assert.equal(existsSync(join(f.target, "AGENTS.md")), false);
  }
  // A bad second file stops the run before the first one is written.
  rmSync(f.settings);
  writeFileSync(join(f.target, "web-search.json"), "invalid");
  assert.notEqual(f.run().status, 0);
  assert.equal(existsSync(f.settings), false);
  assert.equal(readFileSync(join(f.target, "web-search.json"), "utf8"), "invalid");
});

test("missing source and settings directory are refused", (t) => {
  const f = fixture(t);
  mkdirSync(f.settings, { recursive: true });
  assert.notEqual(f.run().status, 0);
  rmSync(f.settings, { recursive: true });
  rmSync(join(f.source, "web-search.json"));
  assert.notEqual(f.run().status, 0);
  assert.equal(existsSync(f.settings), false);
});

test("deployment into source directory is refused without changing source", (t) => {
  const f = fixture(t);
  const original = readFileSync(join(f.source, "settings.json"), "utf8");
  assert.notEqual(f.run(f.source).status, 0);
  assert.equal(readFileSync(join(f.source, "settings.json"), "utf8"), original);
});
