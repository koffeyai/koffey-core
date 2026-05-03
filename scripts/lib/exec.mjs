/** Cross-platform subprocess execution — Node built-ins only. */

import { spawnSync } from 'node:child_process';

const IS_WIN = process.platform === 'win32';

function cmdName(name) {
  return IS_WIN ? `${name}.cmd` : name;
}

/**
 * Run a command synchronously.
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, captureOutput?: boolean, allowFailure?: boolean }} opts
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
export function run(cmd, args = [], opts = {}) {
  const { cwd, captureOutput = false, allowFailure = false } = opts;
  const stdio = captureOutput ? 'pipe' : 'inherit';
  const result = spawnSync(cmd, args, { cwd, stdio, encoding: 'utf8' });

  const code = result.status ?? 1;
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';

  if (code !== 0 && !allowFailure) {
    const label = [cmd, ...args.slice(0, 2)].join(' ');
    process.stderr.write(`Error: "${label}" exited with code ${code}\n`);
    if (captureOutput && stderr) process.stderr.write(stderr);
    process.exit(code);
  }

  return { code, stdout, stderr };
}

/** Run `npx supabase <args>`. */
export function supabase(args, opts = {}) {
  return run(cmdName('npx'), ['supabase', ...args], opts);
}

/** Run `npm <args>`. */
export function npm(args, opts = {}) {
  return run(cmdName('npm'), args, opts);
}

/** Run `git <args>`. */
export function git(args, opts = {}) {
  return run('git', args, opts);
}

/** Check if a command exists on PATH. */
export function commandExists(name) {
  const check = IS_WIN ? 'where' : 'which';
  const result = spawnSync(check, [name], { stdio: 'ignore' });
  return result.status === 0;
}
