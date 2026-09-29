import { AlreadyExistsError, GuardViolationError } from '@/core/storage';

/**
 * Background upload queue (F10 §3.2, §5.6): max. 2 parallel, automatic retries,
 * progress for the upload indicator. Uploads survive navigation, not closing the app.
 */

export interface UploadItem {
  id: number;
  name: string;
  loaded: number;
  total: number;
  status: 'waiting' | 'uploading' | 'done' | 'failed';
  retry?: () => void;
}

type Task = (onProgress: (loaded: number, total: number) => void) => Promise<unknown>;

const PERMANENT = (error: unknown) =>
  error instanceof AlreadyExistsError || error instanceof GuardViolationError || (error as Error)?.name === 'UploadFileError';

export class UploadQueue {
  private items: UploadItem[] = [];
  private listeners = new Set<() => void>();
  private running = 0;
  private waiting: (() => void)[] = [];
  private counter = 0;

  constructor(
    private readonly concurrency = 2,
    private readonly retryDelays = [1000, 3000, 8000],
  ) {}

  getItems = () => this.items;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get active(): number {
    return this.items.filter((i) => i.status === 'waiting' || i.status === 'uploading').length;
  }

  /** Runs `task` in the queue; resolves with its result, rejects after the retries failed. */
  run<T>(name: string, total: number, task: (onProgress: (loaded: number, total: number) => void) => Promise<T>): Promise<T> {
    const id = ++this.counter;
    this.items = [...this.items.filter((i) => i.status !== 'done'), { id, name, loaded: 0, total, status: 'waiting' }];
    this.emit();
    return new Promise<T>((resolve, reject) => {
      const attempt = async () => {
        await this.slot();
        this.update(id, { status: 'uploading' });
        try {
          let lastError: unknown;
          for (let i = 0; i <= this.retryDelays.length; i++) {
            try {
              const result = await (task as Task)((loaded, t) => this.update(id, { loaded, total: t || total }));
              this.update(id, { status: 'done', loaded: total });
              resolve(result as T);
              return;
            } catch (error) {
              lastError = error;
              if (PERMANENT(error) || i === this.retryDelays.length) break;
              await new Promise((r) => setTimeout(r, this.retryDelays[i]));
            }
          }
          this.update(id, { status: 'failed', retry: () => void attempt() });
          reject(lastError);
        } finally {
          this.release();
        }
      };
      void attempt();
    });
  }

  dismissFinished() {
    this.items = this.items.filter((i) => i.status === 'waiting' || i.status === 'uploading');
    this.emit();
  }

  private async slot() {
    if (this.running < this.concurrency) {
      this.running++;
      return;
    }
    await new Promise<void>((r) => this.waiting.push(r));
    this.running++;
  }

  private release() {
    this.running--;
    this.waiting.shift()?.();
  }

  private update(id: number, patch: Partial<UploadItem>) {
    this.items = this.items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    this.emit();
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}
