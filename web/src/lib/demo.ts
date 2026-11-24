// Per-device state for SAMPLE events: bookmarks and demo registrations.
// Clearly labelled "on this device" in the UI. When Stage 6 lands, these
// move to the saved_events / event_registrations tables.
import { useCallback, useSyncExternalStore } from 'react';
import { readJson, writeJson } from './storage';

export interface DemoRegistration {
  eventId: string;
  passCode: string;      // random, shown as text + QR on the demo ticket
  registeredAt: string;
}

type Listener = () => void;

function createStore<T>(key: string, initial: T) {
  let value = readJson<T>(key, initial);
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set(next: T) { value = next; writeJson(key, next); listeners.forEach(l => l()); },
    subscribe(l: Listener) { listeners.add(l); return () => listeners.delete(l); },
  };
}

const savedStore = createStore<string[]>('campussync.saved', []);
const regStore = createStore<DemoRegistration[]>('campussync.demoRegistrations', []);

export function useSavedEvents() {
  const ids = useSyncExternalStore(savedStore.subscribe, savedStore.get);
  const toggle = useCallback((id: string) => {
    const cur = savedStore.get();
    savedStore.set(cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  }, []);
  return { savedIds: new Set(ids), toggle };
}

function randomPassCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return 'DEMO-' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function useDemoRegistrations() {
  const regs = useSyncExternalStore(regStore.subscribe, regStore.get);
  const register = useCallback((eventId: string): DemoRegistration => {
    const existing = regStore.get().find(r => r.eventId === eventId);
    if (existing) return existing;
    const reg = { eventId, passCode: randomPassCode(), registeredAt: new Date().toISOString() };
    regStore.set([...regStore.get(), reg]);
    return reg;
  }, []);
  const cancel = useCallback((eventId: string) => regStore.set(regStore.get().filter(r => r.eventId !== eventId)), []);
  return { regs, register, cancel, find: (eventId: string) => regs.find(r => r.eventId === eventId) };
}
