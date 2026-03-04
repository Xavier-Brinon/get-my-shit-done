/**
 * GMSD Tools Tests - render-mermaid.cjs
 *
 * Unit tests for the renderWithinWidth function in get-my-shit-done/bin/render-mermaid.cjs.
 * Covers: output validity, Unicode box-drawing characters, width constraint enforcement,
 * return value shape, null return for unrenderable diagrams, and custom maxWidth parameter.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { renderWithinWidth } = require(path.join(
  __dirname,
  '..',
  'get-my-shit-done',
  'bin',
  'render-mermaid.cjs'
));

const SIMPLE_FLOWCHART = 'flowchart LR\n    A --> B';

// A wide diagram: 10+ nodes in a single horizontal chain.
// This forces beautiful-mermaid to produce output that exceeds 120 columns
// even at paddingX: 0, so renderWithinWidth must return null.
const VERY_WIDE_FLOWCHART = [
  'flowchart LR',
  '    N1[Node One Long Label] --> N2[Node Two Long Label]',
  '    N2 --> N3[Node Three Long Label]',
  '    N3 --> N4[Node Four Long Label]',
  '    N4 --> N5[Node Five Long Label]',
  '    N5 --> N6[Node Six Long Label]',
  '    N6 --> N7[Node Seven Long Label]',
  '    N7 --> N8[Node Eight Long Label]',
  '    N8 --> N9[Node Nine Long Label]',
  '    N9 --> N10[Node Ten Long Label]',
  '    N10 --> N11[Node Eleven Long Label]',
  '    N11 --> N12[Node Twelve Long Label]',
].join('\n');

describe('renderWithinWidth', () => {
  test('returns non-null result for a simple flowchart', async () => {
    const result = await renderWithinWidth(SIMPLE_FLOWCHART);
    assert.ok(result !== null, 'Expected non-null result for simple flowchart');
  });

  test('returned ascii string is non-empty and contains Unicode box-drawing characters', async () => {
    const result = await renderWithinWidth(SIMPLE_FLOWCHART);
    assert.ok(result !== null, 'Expected non-null result');
    assert.ok(typeof result.ascii === 'string', 'Expected ascii to be a string');
    assert.ok(result.ascii.length > 0, 'Expected non-empty ascii string');

    // Unicode box-drawing characters: box corners (┌ ┐ └ ┘), horizontal (─),
    // vertical (│), and arrow (►). Any one of these confirms Unicode output.
    const unicodeBoxChars = /[┌┐└┘─│►▶◀▲▼╌╮╭╔╗╚╝║═●]/u;
    assert.ok(
      unicodeBoxChars.test(result.ascii),
      `Expected Unicode box-drawing characters in output. Got:\n${result.ascii}`
    );
  });

  test('all lines in output are <= 120 characters wide', async () => {
    const result = await renderWithinWidth(SIMPLE_FLOWCHART);
    assert.ok(result !== null, 'Expected non-null result');

    const lines = result.ascii.split('\n');
    for (const line of lines) {
      assert.ok(
        line.length <= 120,
        `Line exceeds 120 columns (${line.length}): "${line}"`
      );
    }
  });

  test('returns result object with { ascii, paddingX, width } shape', async () => {
    const result = await renderWithinWidth(SIMPLE_FLOWCHART);
    assert.ok(result !== null, 'Expected non-null result');
    assert.ok(Object.prototype.hasOwnProperty.call(result, 'ascii'), 'Expected ascii property');
    assert.ok(Object.prototype.hasOwnProperty.call(result, 'paddingX'), 'Expected paddingX property');
    assert.ok(Object.prototype.hasOwnProperty.call(result, 'width'), 'Expected width property');
    assert.ok(typeof result.ascii === 'string', 'Expected ascii to be string');
    assert.ok(typeof result.paddingX === 'number', 'Expected paddingX to be number');
    assert.ok(typeof result.width === 'number', 'Expected width to be number');
    assert.ok([0, 1, 2].includes(result.paddingX), `Expected paddingX to be 0, 1, or 2; got ${result.paddingX}`);
    assert.ok(result.width > 0, 'Expected width > 0');
    assert.ok(result.width <= 120, `Expected width <= 120; got ${result.width}`);
  });

  test('returns null for an extremely wide diagram that cannot fit in 120 columns', async () => {
    const result = await renderWithinWidth(VERY_WIDE_FLOWCHART);
    assert.strictEqual(
      result,
      null,
      'Expected null for diagram that exceeds 120 columns at all paddingX values'
    );
  });

  test('respects custom maxWidth parameter', async () => {
    // A small maxWidth (60) should cause the simple flowchart to still fit,
    // while a maxWidth of 1 should force a null return.
    const resultFits = await renderWithinWidth(SIMPLE_FLOWCHART, 60);
    assert.ok(resultFits !== null, 'Simple flowchart should fit within 60 columns');
    assert.ok(resultFits.width <= 60, `Expected width <= 60; got ${resultFits.width}`);

    const resultTooNarrow = await renderWithinWidth(SIMPLE_FLOWCHART, 1);
    assert.strictEqual(
      resultTooNarrow,
      null,
      'Expected null when maxWidth is 1 (too narrow for any diagram)'
    );
  });
});
