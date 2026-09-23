import type { MaskParams, RGB } from "./mask";
import type {
  BuildResult,
  LoadResult,
  PreviewResult,
  WorkerRequest,
  WorkerResponse,
} from "./protocol";

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;

type Pending = {
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
};

/** The page's side of the image worker: each method is one request. */
export class ImageWorker {
  private worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  private pending = new Map<number, Pending>();
  private nextId = 1;

  constructor() {
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const waiting = this.pending.get(event.data.id);
      if (!waiting) return;
      this.pending.delete(event.data.id);
      waiting.resolve(event.data);
    };
    this.worker.onerror = () => this.rejectAll(new Error("The image worker crashed"));
  }

  /** Copies the bitmap into the worker; the caller keeps its own. */
  load(bitmap: ImageBitmap, background: string): Promise<LoadResult> {
    return this.ask({ type: "load", bitmap, background }) as Promise<LoadResult>;
  }

  async setBackground(background: string): Promise<void> {
    await this.ask({ type: "background", background });
  }

  pick(x: number, y: number): Promise<RGB> {
    return this.ask({ type: "pick", x, y }) as Promise<RGB>;
  }

  /** Resolves to null when a newer preview made this one unnecessary. */
  preview(params: MaskParams): Promise<PreviewResult | null> {
    return this.ask({ type: "preview", params }) as Promise<PreviewResult | null>;
  }

  /** Resolves to null when a newer build made this one unnecessary. */
  build(params: MaskParams, stops: number): Promise<BuildResult | null> {
    return this.ask({ type: "build", params, stops }) as Promise<BuildResult | null>;
  }

  /** Resolves to null when a newer build made this one unnecessary. */
  buildPq(params: MaskParams, stops: number): Promise<BuildResult | null> {
    return this.ask({ type: "buildPq", params, stops }) as Promise<BuildResult | null>;
  }

  dispose(): void {
    this.worker.terminate();
    this.rejectAll(new Error("The image worker was closed"));
  }

  private async ask(request: WithoutId<WorkerRequest>): Promise<unknown> {
    const id = this.nextId++;
    const response = await new Promise<WorkerResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...request, id });
    });
    if (!response.ok) throw new Error(response.error);
    return response.skipped ? null : response.result;
  }

  private rejectAll(error: Error): void {
    for (const waiting of this.pending.values()) waiting.reject(error);
    this.pending.clear();
  }
}
