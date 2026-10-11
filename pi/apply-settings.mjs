import { chmodSync, constants, copyFileSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const paths = process.argv.slice(2).map((path) => resolve(path));
if (paths.length === 0 || paths.length % 2 !== 0) {
  throw new Error("Usage: node apply-settings.mjs <source-settings> <target-settings> [<source> <target>]...");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readSettings(path) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (!isObject(value)) throw new Error(`Settings must be a JSON object: ${path}`);
  return value;
}

// Dotfiles own their declared keys; local-only keys survive, including nested ones.
// Arrays (notably packages and enabledModels) are replaced, not concatenated.
function merge(local, shared) {
  return Object.fromEntries(
    [...new Set([...Object.keys(local), ...Object.keys(shared)])].map((key) => {
      if (!Object.hasOwn(shared, key)) return [key, local[key]];
      return [key, isObject(local[key]) && isObject(shared[key])
        ? merge(local[key], shared[key]) : shared[key]];
    }),
  );
}

// Validate every pair before writing any, so one bad file changes nothing.
function plan(source, target) {
  let stat;
  try {
    stat = lstatSync(target);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (stat?.isSymbolicLink()) {
    if (resolve(dirname(target), readlinkSync(target)) !== source) {
      throw new Error(`Existing symlink left untouched: ${target}`);
    }
  } else if (stat && !stat.isFile()) {
    throw new Error(`Existing path is not a regular file: ${target}`);
  }
  const shared = readSettings(source);
  const local = stat ? readSettings(target) : {};
  mkdirSync(dirname(target), { recursive: true });
  if (realpathSync(dirname(target)) === realpathSync(dirname(source))) {
    throw new Error("Target directory must be outside the dotfiles Pi directory");
  }
  return { target, stat, content: `${JSON.stringify(merge(local, shared), null, 2)}\n` };
}

function apply({ target, stat, content }) {
  if (stat?.isFile() && readFileSync(target, "utf8") === content) {
    console.log(`Unchanged: ${target}`);
    return;
  }
  // Keep the first pre-deployment snapshot outside the repository.
  if (stat) {
    try {
      copyFileSync(target, `${target}.before-dotfiles.bak`, constants.COPYFILE_EXCL);
      chmodSync(`${target}.before-dotfiles.bak`, 0o600);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  const temporary = join(dirname(target), `.settings-${process.pid}-${Date.now()}.tmp`);
  try {
    writeFileSync(temporary, content, { flag: "wx", mode: 0o600 });
    // Rename replaces a legacy symlink itself, never its repository source.
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
  console.log(`Applied: ${target}`);
}

const plans = [];
for (let index = 0; index < paths.length; index += 2) plans.push(plan(paths[index], paths[index + 1]));
plans.forEach(apply);
