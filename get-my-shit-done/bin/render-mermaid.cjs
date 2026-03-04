#!/usr/bin/env node
/**
 * render-mermaid.cjs — Facade over beautiful-mermaid renderMermaidASCII().
 *
 * Facade pattern: this script is the single integration point for MermaidJS
 * ASCII rendering in GMSD. No other code calls beautiful-mermaid directly.
 * This isolates the project from API changes in the upstream package.
 *
 * Note: beautiful-mermaid is an ESM-only package. This CJS module uses
 * dynamic import() to load it. All public exports are therefore async.
 *
 * Exports:
 *   renderWithinWidth(source, maxWidth) — async: render Mermaid source to
 *     ASCII within a maximum column width.
 *
 * CLI usage:
 *   node render-mermaid.cjs diagram.mmd          # render file to stdout
 *   echo "flowchart LR\n  A --> B" | node render-mermaid.cjs  # render stdin
 *
 * Output: ASCII art to stdout; max line width to stderr (diagnostics).
 * Exit 1 if rendering fails or all paddingX values exceed maxWidth.
 *
 * Note on useAscii option: useAscii: false means USE Unicode box-drawing
 * characters (┌─┐│└┘). This is counterintuitive — the option name is inverted.
 * useAscii: true produces plain ASCII (+, -, |) which is less readable.
 * We default to useAscii: false for Unicode output.
 */

'use strict';

/**
 * Render Mermaid source to ASCII art within a maximum column width.
 *
 * Attempts paddingX values [2, 1, 0] in order. Returns the first result
 * that fits within maxWidth columns. If none fit, returns null — the caller
 * must simplify the diagram source before re-rendering.
 *
 * @param {string} source   Mermaid diagram source (e.g. "flowchart LR\n  A --> B")
 * @param {number} maxWidth Maximum line width in columns (default: 120)
 * @returns {Promise<{ ascii: string, paddingX: number, width: number } | null>}
 */
async function renderWithinWidth(source, maxWidth = 120) {
  const { renderMermaidASCII } = await import('beautiful-mermaid');
  const paddingSteps = [2, 1, 0];

  for (const paddingX of paddingSteps) {
    const ascii = renderMermaidASCII(source, {
      useAscii: false,       // false = Unicode box-drawing characters (more readable)
      paddingX,
      paddingY: 1,
      boxBorderPadding: 1,
    });

    const lines = ascii.split('\n');
    const width = Math.max(...lines.map(l => l.length));

    if (width <= maxWidth) {
      return { ascii, paddingX, width };
    }
  }

  // All paddingX values produced output exceeding maxWidth.
  // Caller must simplify the diagram source.
  return null;
}

module.exports = { renderWithinWidth };

// CLI entry point — only runs when script is invoked directly.
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');

  async function run(source) {
    let result;
    try {
      result = await renderWithinWidth(source);
    } catch (err) {
      process.stderr.write(`Error rendering diagram: ${err.message}\n`);
      process.exit(1);
    }

    if (result === null) {
      process.stderr.write(
        'Error: diagram exceeds 120 columns at all paddingX values (2, 1, 0).\n' +
        'Simplify the Mermaid source to reduce horizontal width.\n'
      );
      process.exit(1);
    }

    process.stdout.write(result.ascii + '\n');
    process.stderr.write(`Max line width: ${result.width} columns (paddingX: ${result.paddingX})\n`);
  }

  const fileArg = process.argv[2];

  if (fileArg) {
    // File argument mode: node render-mermaid.cjs diagram.mmd
    const filePath = path.resolve(process.cwd(), fileArg);
    let source;
    try {
      source = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      process.stderr.write(`Error reading file '${fileArg}': ${err.message}\n`);
      process.exit(1);
    }
    run(source).catch(err => {
      process.stderr.write(`Unexpected error: ${err.message}\n`);
      process.exit(1);
    });
  } else {
    // Stdin mode: echo "flowchart LR\n  A --> B" | node render-mermaid.cjs
    let source = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => { source += chunk; });
    process.stdin.on('end', () => {
      if (!source.trim()) {
        process.stderr.write('Error: no Mermaid source provided (stdin was empty).\n');
        process.exit(1);
      }
      run(source).catch(err => {
        process.stderr.write(`Unexpected error: ${err.message}\n`);
        process.exit(1);
      });
    });
  }
}
