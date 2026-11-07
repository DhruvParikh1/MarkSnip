// The benchmark script pulls in @playwright/test at module load, which cannot
// initialize inside the Jest environment. The functions under test never
// launch a browser, so stub the dependency out.
jest.mock('@playwright/test', () => ({ chromium: {} }));

const {
  parseArgs,
  percentile,
  summarizeMetric
} = require('../../scripts/benchmark-popup-startup');

describe('popup benchmark arguments', () => {
  test('defaults to the repo extension with 10 iterations and 1 warmup', () => {
    const options = parseArgs([]);

    expect(options.iterations).toBe(10);
    expect(options.warmup).toBe(1);
    expect(options.targets).toEqual([
      { label: 'current', extensionPath: expect.stringMatching(/src$/) }
    ]);
  });

  test('parses target and tuning flags', () => {
    const options = parseArgs([
      '--iterations', '6',
      '--warmup', '2',
      '--current', '/tmp/current-src',
      '--baseline', '/tmp/baseline-src'
    ]);

    expect(options.iterations).toBe(6);
    expect(options.warmup).toBe(2);
    expect(options.targets).toEqual([
      { label: 'current', extensionPath: '/tmp/current-src' },
      { label: 'baseline', extensionPath: '/tmp/baseline-src' }
    ]);
  });

  test('rejects flags that are missing their value', () => {
    expect(() => parseArgs(['--current'])).toThrow(/--current requires a value/);
    expect(() => parseArgs(['--baseline'])).toThrow(/--baseline requires a value/);
    expect(() => parseArgs(['--extension-path'])).toThrow(/--extension-path requires a value/);
    expect(() => parseArgs(['--iterations'])).toThrow(/--iterations requires a value/);
  });

  test('rejects invalid iteration and warmup values', () => {
    expect(() => parseArgs(['--iterations', '0'])).toThrow(/Invalid --iterations value/);
    expect(() => parseArgs(['--iterations', 'abc'])).toThrow(/Invalid --iterations value/);
    expect(() => parseArgs(['--warmup', '-1'])).toThrow(/Invalid --warmup value/);
  });

  test('still parses flags after a repeated flag name', () => {
    const options = parseArgs([
      '--current', '/tmp/first',
      '--current', '/tmp/second'
    ]);

    expect(options.targets).toEqual([
      { label: 'current', extensionPath: '/tmp/first' },
      { label: 'current', extensionPath: '/tmp/second' }
    ]);
  });
});

describe('popup benchmark statistics', () => {
  test('percentile picks the nearest-rank value', () => {
    const values = [40, 10, 30, 20, 50];

    expect(percentile(values, 0)).toBe(10);
    expect(percentile(values, 0.5)).toBe(30);
    expect(percentile(values, 0.95)).toBe(50);
  });

  test('summarizeMetric reports min, median, p95, mean, and max', () => {
    const summary = summarizeMetric([10, 20, 30, 40, 50]);

    expect(summary).toEqual({
      min: 10,
      median: 30,
      p95: 50,
      mean: 30,
      max: 50
    });
  });

  test('summarizeMetric rounds mean to one decimal place', () => {
    const summary = summarizeMetric([1, 2]);

    expect(summary.mean).toBe(1.5);
  });
});
