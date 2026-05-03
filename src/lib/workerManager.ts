// Web Worker management utility
// Vite requires static URLs for workers - define them explicitly
const workerUrls: Record<string, URL> = {
  analytics: new URL('../workers/analyticsWorker.ts', import.meta.url),
};

class WorkerManager {
  private workers: Map<string, Worker> = new Map();
  
  getWorker(name: string): Worker {
    if (!this.workers.has(name)) {
      const url = workerUrls[name];
      if (!url) {
        throw new Error(`Unknown worker: ${name}. Add it to workerUrls in workerManager.ts`);
      }
      const worker = new Worker(url, {
        type: 'module'
      });
      this.workers.set(name, worker);
    }
    return this.workers.get(name)!;
  }
  
  async executeInWorker<T>(workerName: string, type: string, data: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const worker = this.getWorker(workerName);
      
      const handleMessage = (e: MessageEvent) => {
        if (e.data.type === `${type}_CALCULATED` || e.data.type === `${type}_PROCESSED`) {
          worker.removeEventListener('message', handleMessage);
          resolve(e.data.result);
        }
      };
      
      const handleError = (error: ErrorEvent) => {
        worker.removeEventListener('error', handleError);
        reject(error);
      };
      
      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);
      
      worker.postMessage({ type, data });
    });
  }
  
  cleanup() {
    this.workers.forEach(worker => worker.terminate());
    this.workers.clear();
  }
}

export const workerManager = new WorkerManager();