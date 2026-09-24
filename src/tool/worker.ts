import { Pipeline } from "./pipeline";
import type { WorkerRequest, WorkerResponse } from "./protocol";

// DOM and worker typings can't be loaded together, so describe the little of
// the worker scope that is used.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
};

const pipeline = new Pipeline();

// Requests run one at a time, in order.
let queue: Promise<void> = Promise.resolve();

// Slider drags send many previews and builds. Only the newest of each kind is
// worth computing, so older ones still waiting in the queue are skipped.
const newest = { preview: 0, build: 0, buildPq: 0 };

async function handle(request: WorkerRequest): Promise<void> {
  if (
    (request.type === "preview" || request.type === "build" || request.type === "buildPq") &&
    request.id < newest[request.type]
  ) {
    scope.postMessage({ id: request.id, ok: true, skipped: true });
    return;
  }
  try {
    switch (request.type) {
      case "load":
        scope.postMessage({
          id: request.id,
          ok: true,
          result: pipeline.load(request.bitmap, request.background),
        });
        break;
      case "background":
        pipeline.setBackground(request.background);
        scope.postMessage({ id: request.id, ok: true });
        break;
      case "pick":
        scope.postMessage({
          id: request.id,
          ok: true,
          result: pipeline.pick(request.x, request.y),
        });
        break;
      case "preview": {
        const result = pipeline.preview(request.params);
        scope.postMessage({ id: request.id, ok: true, result }, [result.pixels.buffer]);
        break;
      }
      case "build": {
        const result = await pipeline.build(request.params, request.stops);
        scope.postMessage({ id: request.id, ok: true, result }, [result.jpeg.buffer]);
        break;
      }
      case "buildPq": {
        const result = pipeline.buildPq(request.params, request.stops);
        scope.postMessage({ id: request.id, ok: true, result }, [result.jpeg.buffer]);
        break;
      }
    }
  } catch (error) {
    scope.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

scope.onmessage = (event) => {
  const request = event.data;
  if (request.type === "preview" || request.type === "build" || request.type === "buildPq") {
    newest[request.type] = request.id;
  }
  queue = queue.then(() => handle(request));
};
