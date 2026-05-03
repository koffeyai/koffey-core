/** Logging utilities — no dependencies. */

export function log(msg) {
  process.stdout.write(`==> ${msg}\n`);
}

export function warn(msg) {
  process.stderr.write(`Warning: ${msg}\n`);
}

export function die(msg, code = 1) {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(code);
}
