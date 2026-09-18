export class DbClientError extends Error {
  constructor(error) {
    const source = error && typeof error === 'object' ? error : { message: String(error) };
    super(typeof source.message === 'string' ? source.message : 'Erro no banco SQLite.');
    this.name = typeof source.name === 'string' ? source.name : 'DbClientError';
    if (typeof source.code === 'string' || typeof source.code === 'number') {
      this.code = source.code;
    }
    if (typeof source.resultCode === 'number') this.resultCode = source.resultCode;
    if (source.details !== undefined) this.details = source.details;
    if (typeof source.stack === 'string') this.remoteStack = source.stack;
  }

  toJSON() {
    const result = { name: this.name, message: this.message };
    if (this.code !== undefined) result.code = this.code;
    if (this.resultCode !== undefined) result.resultCode = this.resultCode;
    if (this.details !== undefined) result.details = this.details;
    return result;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isArrayBuffer(value) {
  return (
    value instanceof ArrayBuffer ||
    (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer)
  );
}

function workerError(event) {
  return new DbClientError({
    name: 'WorkerError',
    code: 'WORKER_ERROR',
    message: event?.message || 'O Web Worker SQLite falhou.',
  });
}

export class DbClient {
  constructor(options = {}) {
    if (options && typeof options.postMessage === 'function') options = { worker: options };

    this.worker = options.worker ?? this.createWorker(options);
    this.pending = new Map();
    this.nextRequestId = 1;
    this.closed = false;
    this.closing = false;
    this.closePromise = undefined;

    this.handleMessage = (event) => this.onMessage(event);
    this.handleError = (event) => this.onWorkerError(event);
    this.addWorkerListener('message', this.handleMessage);
    this.addWorkerListener('error', this.handleError);
    this.addWorkerListener('messageerror', this.handleError);
  }

  createWorker(options) {
    if (typeof options.workerFactory === 'function') return options.workerFactory();
    if (typeof Worker !== 'function') {
      throw new DbClientError({
        name: 'WorkerUnavailableError',
        code: 'WORKER_UNAVAILABLE',
        message: 'Web Worker não está disponível neste ambiente.',
      });
    }
    return new Worker(new URL('./db-worker.js', import.meta.url), { type: 'module' });
  }

  addWorkerListener(type, handler) {
    if (typeof this.worker.addEventListener === 'function') {
      this.worker.addEventListener(type, handler);
    } else {
      this.worker[`on${type}`] = handler;
    }
  }

  onMessage(event) {
    const message = event?.data ?? event;
    if (!isRecord(message) || message.id === undefined || message.id === null) return;

    const request = this.pending.get(message.id);
    if (!request) return;
    this.pending.delete(message.id);

    if (message.ok) {
      request.resolve(message.result);
    } else {
      request.reject(new DbClientError(message.error));
    }
  }

  onWorkerError(event) {
    if (this.closed) return;
    const error = event instanceof Error ? event : workerError(event);
    this.closed = true;
    this.rejectPending(error);
  }

  rejectPending(error) {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }

  request(type, payload, transfer = []) {
    if (this.closed) {
      return Promise.reject(
        new DbClientError({
          name: 'ClientClosedError',
          code: 'CLIENT_CLOSED',
          message: 'O cliente SQLite já foi fechado.',
        }),
      );
    }

    const id = `db-${this.nextRequestId++}`;
    const message = { id, type, payload };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        if (transfer.length > 0) this.worker.postMessage(message, transfer);
        else this.worker.postMessage(message);
      } catch (error) {
        this.pending.delete(id);
        reject(new DbClientError(error));
      }
    });
  }

  init(arrayBuffer, { transfer = false } = {}) {
    if (!isArrayBuffer(arrayBuffer) || arrayBuffer.byteLength === 0) {
      return Promise.reject(
        new DbClientError({
          name: 'InvalidArgumentError',
          code: 'INVALID_DATABASE_BUFFER',
          message: 'init exige um ArrayBuffer não vazio.',
        }),
      );
    }

    return this.request(
      'init',
      { buffer: arrayBuffer },
      transfer && arrayBuffer instanceof ArrayBuffer ? [arrayBuffer] : [],
    );
  }

  getFilters() {
    return this.request('getFilters', {});
  }

  searchQuestions(options = {}) {
    return this.request('searchQuestions', options);
  }

  getQuestion(questionOrKey) {
    const payload = isRecord(questionOrKey) ? questionOrKey : { id: questionOrKey };
    return this.request('getQuestion', payload);
  }

  close() {
    if (this.closed) return Promise.resolve({ closed: true });
    if (this.closePromise) return this.closePromise;

    this.closing = true;
    this.closePromise = this.request('close').then(
      (result) => {
        this.finishClose();
        return result;
      },
      (error) => {
        this.finishClose();
        throw error;
      },
    );
    return this.closePromise;
  }

  finishClose() {
    this.closed = true;
    this.closing = false;
    this.rejectPending(
      new DbClientError({
        name: 'ClientClosedError',
        code: 'CLIENT_CLOSED',
        message: 'O cliente SQLite foi fechado.',
      }),
    );
    if (typeof this.worker.terminate === 'function') this.worker.terminate();
  }
}

export function createDbClient(options) {
  return new DbClient(options);
}

export default DbClient;
