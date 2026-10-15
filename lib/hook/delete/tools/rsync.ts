import { readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { absolute, type Arg, type Scope } from "../scope.ts";
import { blind, type Rule, type Victim } from "../victim.ts";

// The options taking a value, from openrsync's man page plus rsync 3's, so the operands land where rsync puts them.
const VALUED = new Set(
  (
    "address backup-dir block-size bwlimit checksum-seed chmod compare-dest compress-level contimeout copy-dest " +
    "exclude exclude-from files-from include include-from rsh filter link-dest log-file log-file-format max-delete " +
    "max-size min-size modify-window out-format partial-dir password-file port protocol read-batch rsync-path " +
    "sockopts suffix temp-dir timeout only-write-batch write-batch config info debug usermap groupmap chown iconv " +
    "outbuf stop-after stop-at skip-compress checksum-choice cc compress-choice zc zl remote-option max-alloc copy-as " +
    "early-input"
  ).split(" "),
);
const NUMERIC = new Set(
  (
    "port timeout contimeout bwlimit max-delete max-size min-size modify-window block-size compress-level " +
    "checksum-seed protocol zl stop-after max-alloc"
  ).split(" "),
);
const FLAGS = new Set(
  (
    "8-bit-output append append-verify archive backup blocking-io cache checksum compress copy-links " +
    "copy-unsafe-links copy-dirlinks cvs-exclude del delete delay-updates delete-before delete-during delete-delay " +
    "delete-after delete-excluded delete-missing-args devices dirs dry-run executability existing " +
    "extended-attributes fake-super force from0 fuzzy group hard-links help human-readable ignore-errors " +
    "ignore-existing ignore-missing-args ignore-non-existing ignore-times inplace ipv4 ipv6 itemize-changes " +
    "keep-dirlinks links list-only mkpath detach implied-dirs motd numeric-ids omit-dir-times omit-link-times " +
    "one-file-system owner partial perms progress protect-args prune-empty-dirs quiet recursive relative " +
    "remove-source-files safe-links secluded-args size-only sparse specials stats super times update verbose " +
    "version whole-file xattrs acls atimes crtimes open-noatime fsync preallocate munge-links trust-sender old-args " +
    "copy-devices write-devices msgs2stderr"
  ).split(" "),
);
const SHORT_VALUED: Record<string, string> = {
  e: "rsh",
  f: "filter",
  B: "block-size",
  T: "temp-dir",
  M: "remote-option",
  "@": "modify-window",
};
const DELETES = new Set([
  "del",
  "delete",
  "delete-before",
  "delete-during",
  "delete-delay",
  "delete-after",
  "delete-excluded",
  "delete-missing-args",
]);
const REMOTE = /^(?:rsync:\/\/|[^/]*:)/;
const FILTER = /^(-|\+|P|exclude|include|protect)[ _,]+(.+)$/;

const isDir = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

function patternFile(value: string, scope: Scope): string[] {
  const path = absolute(value, scope);
  try {
    return path ? readFileSync(path, "utf8").split("\n") : [];
  } catch {
    return [];
  }
}

export function rsync(args: Arg[], scope: Scope): Victim[] {
  const paths: Arg[] = [];
  const rules: Rule[] = [];
  const seen = new Set<string>();
  const unknown: string[] = [];
  const swallowed: string[] = [];

  const take = (name: string, arg: Arg | undefined): void => {
    const value = arg?.value;
    if (typeof value !== "string") return;
    if (NUMERIC.has(name) && /[/~]/.test(value))
      swallowed.push(`\`--${name}\` takes a value, so it swallowed \`${value}\``);
    if (name === "exclude" || name === "include") rules.push({ exclude: name === "exclude", pattern: value });
    if (name === "filter") {
      const [, kind = "", pattern = ""] = FILTER.exec(value.trim()) ?? [];
      if (pattern) rules.push({ exclude: kind !== "+" && kind !== "include", pattern });
    }
    if (name === "exclude-from" || name === "include-from")
      for (const line of patternFile(value, scope))
        if (line.trim() && !/^[#;]/.test(line)) rules.push({ exclude: name === "exclude-from", pattern: line.trim() });
  };

  let ended = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as Arg;
    const value = arg.value;
    if (ended || typeof value !== "string" || !value.startsWith("-") || value === "-") paths.push(arg);
    else if (value === "--") ended = true;
    else if (value.startsWith("--")) {
      const eq = value.indexOf("=");
      const name = (eq < 0 ? value : value.slice(0, eq)).slice(2);
      seen.add(name);
      if (VALUED.has(name)) take(name, eq < 0 ? args[++i] : { raw: value, value: value.slice(eq + 1) });
      else if (!FLAGS.has(name.replace(/^no-/, ""))) unknown.push(value);
    } else {
      for (let j = 1; j < value.length; j++) {
        const letter = value[j] ?? "";
        const long = SHORT_VALUED[letter];
        seen.add(letter);
        if (!long) continue;
        const inline = value.slice(j + 1);
        take(long, inline ? { raw: value, value: inline } : args[++i]);
        break;
      }
    }
  }

  if (seen.has("dry-run") || seen.has("n") || seen.has("list-only")) return [];
  const deleting = [...seen].some((name) => DELETES.has(name));
  const last = paths.at(-1)?.value;
  const landing = paths.length > 1 && last ? absolute(last, scope) : scope.cwd;
  const stop = (why: string): Victim[] => [{ kind: "stop", tool: "rsync", why, within: landing }];
  if (swallowed.length || (deleting && paths.length === 1)) {
    const parts = [...swallowed];
    if (deleting && paths.length === 1)
      parts.push(
        `the only path left is \`${paths[0]?.raw}\`, and with one path rsync lists it while openrsync still runs ` +
          `--delete against the current directory, ${scope.cwd ?? "whatever it is"}`,
      );
    return stop(
      `would not do what it says: ${parts.join("; ")}. Fix the options and name both the source and the destination`,
    );
  }
  if (deleting && unknown.length)
    return stop(
      `can't be checked, because the guard doesn't know \`${unknown[0]}\` and so can't tell which words are paths`,
    );
  if (paths.length < 2 || seen.has("backup") || seen.has("b")) return [];

  const destArg = paths.at(-1) as Arg;
  if (typeof destArg.value !== "string") return [blind("rsync", destArg, scope)];
  if (REMOTE.test(destArg.value)) return [];
  const dest = absolute(destArg.value, scope);
  if (!dest) return [blind("rsync", destArg, scope)];
  const recursive = seen.has("r") || seen.has("a") || seen.has("recursive") || seen.has("archive");
  const relative = seen.has("R") || seen.has("relative");
  const overwrite = !seen.has("ignore-existing");
  const kept = seen.has("delete-excluded") ? [] : rules;

  return paths.slice(0, -1).flatMap((source): Victim[] => {
    const value = source.value;
    if (typeof value !== "string") return [blind("rsync", source, scope)];
    if (REMOTE.test(value))
      return deleting ? [{ kind: "mirror", target: dest, rules: kept, prune: true, overwrite, tool: "rsync" }] : [];
    const from = absolute(value, scope);
    if (!from) return [blind("rsync", source, scope)];
    if (!isDir(from)) {
      const target = isDir(dest) ? join(dest, basename(from)) : dest;
      return overwrite ? [{ kind: "path", path: target, how: "entry", tool: "rsync" }] : [];
    }
    if (!recursive) return [];
    const target = relative
      ? join(dest, value.includes("/./") ? value.slice(value.indexOf("/./") + 3) : value.replace(/^\/+/, ""))
      : from.endsWith("/")
        ? dest
        : join(dest, basename(from));
    return [{ kind: "mirror", target, source: from, rules: kept, prune: deleting, overwrite, tool: "rsync" }];
  });
}
