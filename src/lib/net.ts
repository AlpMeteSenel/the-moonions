import * as THREE from "three";

/**
 * Headers sent with every backend request.
 * `ngrok-skip-browser-warning` makes ngrok's free tier skip its HTML interstitial page,
 * which would otherwise replace JSON and image responses when the backend is tunnelled.
 */
export const BACKEND_HEADERS: Record<string, string> = { "ngrok-skip-browser-warning": "true" };

const blobs = new Map<string, Promise<string>>();

/** Fetch a backend file with the headers above and return a local blob: URL (cached). */
export function blobUrl(url: string): Promise<string> {
  let p = blobs.get(url);
  if (!p) {
    p = fetch(url, { headers: BACKEND_HEADERS })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${url}`);
        return r.blob();
      })
      .then((b) => URL.createObjectURL(b));
    p.catch(() => blobs.delete(url));
    blobs.set(url, p);
  }
  return p;
}

/**
 * three.js loads images through <img>, which cannot send custom headers, so textures are
 * fetched with the headers first and then decoded from a blob: URL.
 * Drop-in for TextureLoader, usable with `useLoader(HeaderTextureLoader, urls)`.
 */
export class HeaderTextureLoader extends THREE.Loader<THREE.Texture> {
  load(url: string, onLoad?: (t: THREE.Texture) => void, onProgress?: (e: ProgressEvent) => void, onError?: (e: unknown) => void) {
    const tex = new THREE.Texture();
    blobUrl(this.manager.resolveURL(url))
      .then((b) =>
        new THREE.TextureLoader(this.manager).load(
          b,
          (t) => {
            tex.image = t.image;
            tex.needsUpdate = true;
            onLoad?.(tex);
          },
          onProgress,
          onError,
        ),
      )
      .catch((e) => onError?.(e));
    return tex;
  }
}
