/** Interactive prompts via Node readline — used by bootstrap only. */

import { createInterface } from 'node:readline';

/**
 * Read a line with input hidden (characters replaced with *).
 * Works on macOS, Linux, and Windows when stdin is a TTY.
 */
function readSecret(label) {
  return new Promise((resolve) => {
    process.stdout.write(`${label}: `);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let input = '';
    const onData = (ch) => {
      const c = ch.toString();
      if (c === '\n' || c === '\r' || c === '\u0004') {
        // Enter or Ctrl-D
        stdin.setRawMode(wasRaw ?? false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(input.trim());
      } else if (c === '\u0003') {
        // Ctrl-C
        process.stdout.write('\n');
        process.exit(1);
      } else if (c === '\u007f' || c === '\b') {
        // Backspace
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        input += c;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

/**
 * Create a prompter that wraps readline for interactive credential collection.
 * @param {{ noPrompt?: boolean }} opts
 */
export function createPrompter(opts = {}) {
  const noPrompt = opts.noPrompt ?? false;
  const isTTY = process.stdin.isTTY ?? false;

  let rl = null;
  function getRL() {
    if (!rl) {
      rl = createInterface({ input: process.stdin, output: process.stdout });
    }
    return rl;
  }

  function ask(label) {
    return new Promise((resolve) => {
      getRL().question(`${label}: `, (answer) => resolve(answer.trim()));
    });
  }

  async function askMaybeSecret(label, secret) {
    if (secret && isTTY) {
      // Close readline temporarily so it doesn't fight over stdin
      if (rl) { rl.close(); rl = null; }
      return readSecret(label);
    }
    return ask(label);
  }

  return {
    /**
     * Prompt for a required value.
     * If currentValue is non-empty, returns it without prompting.
     */
    async required(label, currentValue, { secret = false } = {}) {
      if (currentValue) return currentValue;
      if (noPrompt || !isTTY) {
        throw new Error(`Missing required value: ${label}`);
      }
      const value = await askMaybeSecret(label, secret);
      if (!value) throw new Error(`Missing required value: ${label}`);
      return value;
    },

    /**
     * Prompt for an optional value. Returns '' if user presses Enter.
     */
    async optional(label, currentValue, { secret = false } = {}) {
      if (currentValue) return currentValue;
      if (noPrompt || !isTTY) return '';
      const hint = secret ? ' (Enter to skip)' : ' (Enter to skip)';
      return await askMaybeSecret(`${label}${hint}`, secret);
    },

    /**
     * Prompt with a default and allowed choices.
     */
    async choice(label, choices, defaultValue) {
      if (noPrompt || !isTTY) return defaultValue;
      const choiceStr = choices.join('/');
      const value = await ask(`${label} [${choiceStr}] (default: ${defaultValue})`);
      return value || defaultValue;
    },

    close() {
      if (rl) {
        rl.close();
        rl = null;
      }
    },
  };
}
