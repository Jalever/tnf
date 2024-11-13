import { expect, test } from 'vitest';
import { PluginHookType, PluginManager } from './plugin_manager';
import type { Plugin } from './types';

test('PluginManager should execute plugins in correct order (pre -> normal -> post)', async () => {
  const order: string[] = [];
  const plugins: Plugin[] = [
    { enforce: 'post', buildStart: () => order.push('post') },
    { enforce: 'pre', buildStart: () => order.push('pre') },
    { buildStart: () => order.push('normal') },
  ];

  const manager = new PluginManager(plugins);
  await manager.apply({
    hook: 'buildStart',
    args: [],
    type: PluginHookType.Series,
    pluginContext: {},
  });

  expect(order).toEqual(['pre', 'normal', 'post']);
});

test('First hook type should return first non-null result', async () => {
  const plugins: Plugin[] = [
    { buildStart: () => null },
    { buildStart: () => 'second' },
    { buildStart: () => 'third' },
  ];

  const manager = new PluginManager(plugins);
  const result = await manager.apply({
    hook: 'buildStart',
    args: [],
    type: PluginHookType.First,
    pluginContext: {},
  });

  expect(result).toBe('second');
});

test('Series hook type should pass result through plugins', async () => {
  const plugins: (Plugin & { transform: (n: number) => number })[] = [
    { transform: (n: number) => n + 1 },
    { transform: (n: number) => n * 2 },
    { transform: (n: number) => n - 3 },
  ];

  const manager = new PluginManager(plugins);
  const result = await manager.apply({
    hook: 'transform',
    args: [],
    memo: 5,
    type: PluginHookType.Series,
    pluginContext: {},
  });

  // 5 -> 6 -> 12 -> 9
  expect(result).toBe(9);
});

test('Parallel hook type should execute plugins concurrently', async () => {
  const delays = [30, 10, 20];
  const order: number[] = [];

  const plugins: (Plugin & { test: () => Promise<string> })[] = delays.map(
    (delay, index) => ({
      test: async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        order.push(index);
        return `result${index}`;
      },
    }),
  );

  const manager = new PluginManager(plugins);
  const results = await manager.apply({
    hook: 'test',
    args: [],
    type: PluginHookType.Parallel,
    pluginContext: {},
  });

  // Results should be in original plugin order
  expect(results).toEqual(['result0', 'result1', 'result2']);
  // Execution order should be based on delays (10ms, 20ms, 30ms)
  expect(order).toEqual([1, 2, 0]);
});

test('Plugin context should be correctly passed to hooks', async () => {
  const context = { value: 42 };
  const plugin: Plugin & { test: () => number } = {
    test() {
      expect(this).toBe(context);
      // @ts-expect-error
      return this.value;
    },
  };

  const manager = new PluginManager([plugin]);
  const result = await manager.apply({
    hook: 'test',
    args: [],
    type: PluginHookType.First,
    pluginContext: context,
  });

  expect(result).toBe(42);
});

test('Invalid hook type should throw error', async () => {
  const manager = new PluginManager([]);

  await expect(
    manager.apply({
      hook: 'test',
      args: [],
      type: 'invalid' as any,
      pluginContext: {},
    }),
  ).rejects.toThrow('Invalid hook type: invalid');
});
