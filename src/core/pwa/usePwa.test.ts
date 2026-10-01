import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyUpdate, type UpdateDeps } from './usePwa';

/** "Aktualisieren" must always end in a reload (v0.14.2). */
class FakeWorker extends EventTarget {
  messages: unknown[] = [];
  constructor(public state: ServiceWorkerState) {
    super();
  }
  postMessage(message: unknown) {
    this.messages.push(message);
  }
  become(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

function setup(registration: { waiting?: FakeWorker | null; installing?: FakeWorker | null } | undefined) {
  const container = new EventTarget() as EventTarget & { getRegistration: () => Promise<unknown> };
  container.getRegistration = async () => registration;
  const reload = vi.fn();
  return { deps: { container, reload } as unknown as UpdateDeps, container, reload };
}

describe('applying an update', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('tells the waiting version to take over and reloads once it controls the page', async () => {
    const waiting = new FakeWorker('installed');
    const { deps, container, reload } = setup({ waiting });
    const done = applyUpdate(deps);
    await vi.advanceTimersByTimeAsync(0);
    expect(waiting.messages).toEqual([{ type: 'SKIP_WAITING' }]);
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    await done;
    expect(reload).toHaveBeenCalledTimes(1); // not twice
  });

  it('reloads anyway when the new version never takes over', async () => {
    const { deps, reload } = setup({ waiting: new FakeWorker('installed') });
    const done = applyUpdate(deps);
    await vi.advanceTimersByTimeAsync(3000);
    await done;
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads at once when nothing is waiting (already activated in another window)', async () => {
    const { deps, reload } = setup({ waiting: null, installing: null });
    await applyUpdate(deps);
    expect(reload).toHaveBeenCalledTimes(1);
    const none = setup(undefined);
    await applyUpdate(none.deps);
    expect(none.reload).toHaveBeenCalledTimes(1);
  });

  it('waits for a version that is still installing, and ignores a second tap meanwhile', async () => {
    const installing = new FakeWorker('installing');
    const { deps, reload } = setup({ waiting: null, installing });
    const first = applyUpdate(deps);
    const second = applyUpdate(deps);
    await vi.advanceTimersByTimeAsync(1000);
    expect(installing.messages).toEqual([]);
    installing.become('installed');
    await vi.advanceTimersByTimeAsync(0);
    expect(installing.messages).toEqual([{ type: 'SKIP_WAITING' }]);
    await vi.advanceTimersByTimeAsync(3000);
    await Promise.all([first, second]);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
