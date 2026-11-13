import { getArtwork } from './music';

const cache = new Map<string, string>();
let generation = 0;
let active = 0;
const queue: (() => void)[] = [];
function drain() {
  while (active < 3 && queue.length) queue.shift()?.();
}
export function clearMusicArtwork() {
  generation++;
  cache.clear();
}
export function fetchMusicArtwork(url: string): Promise<string> {
  const cached = cache.get(url);
  if (cached) return Promise.resolve(cached);
  const requested = generation;
  return new Promise((resolve, reject) => {
    queue.push(() => {
      if (requested !== generation) {
        reject(new Error('Account data cleared.'));
        drain();
        return;
      }
      active++;
      void getArtwork(url)
        .then((data) => {
          if (requested !== generation) {
            reject(new Error('Account data cleared.'));
            return;
          }
          if (cache.size >= 64) cache.delete(cache.keys().next().value!);
          cache.set(url, data);
          resolve(data);
        }, reject)
        .finally(() => {
          active--;
          drain();
        });
    });
    drain();
  });
}
