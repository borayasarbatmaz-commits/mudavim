// Basit IndexedDB anahtar-değer deposu (telefonda kalıcı)
let dbp;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open('mudavim', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction('kv', mode);
    const st = t.objectStore('kv');
    const out = fn(st);
    t.oncomplete = () => res(out?.result);
    t.onerror = () => rej(t.error);
  });
}
const mem = new Map();
export async function get(k) {
  try {
    return await tx('readonly', (s) => s.get(k));
  } catch {
    return mem.get(k);
  }
}
export async function set(k, v) {
  try {
    await tx('readwrite', (s) => s.put(v, k));
  } catch {
    mem.set(k, v);
  }
}
export async function clearAll() {
  try {
    await tx('readwrite', (s) => s.clear());
  } catch {
    mem.clear();
  }
}
