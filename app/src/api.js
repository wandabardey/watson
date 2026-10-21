// Accès au moteur local (API HTTP sur 127.0.0.1), dont l'application donne l'adresse et le jeton.
import { invoke } from '@tauri-apps/api/core';

let moteur = null;
const dansTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function attendreMoteur() {
  if (!dansTauri) {
    // Développement dans un navigateur : moteur lancé à la main (python -m referentiel.api).
    moteur = { port: Number(import.meta.env.VITE_MOTEUR_PORT || 8799), jeton: import.meta.env.VITE_MOTEUR_JETON || 'dev' };
    return moteur;
  }
  for (let i = 0; i < 200; i++) {
    const m = await invoke('moteur');
    if (m && m.erreur) throw new Error(m.erreur);
    if (m && m.port) { moteur = m; return m; }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Le moteur de Watson ne répond pas.');
}

export async function appel(chemin, { methode, corps } = {}) {
  const r = await fetch(`http://127.0.0.1:${moteur.port}/api${chemin}`, {
    method: methode || (corps ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', 'X-Watson-Jeton': moteur.jeton },
    body: corps ? JSON.stringify(corps) : undefined
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erreur || `Erreur ${r.status}`);
  return d;
}

export async function ouvrirLien(url) {
  if (dansTauri) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    return openUrl(url);
  }
  window.open(url, '_blank');
}

export async function verifierMiseAJour() {
  if (!dansTauri) return null;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    return await check();
  } catch {
    return null;
  }
}

export async function installerMiseAJour(maj, progression) {
  let total = 0, recu = 0;
  await maj.downloadAndInstall((e) => {
    if (e.event === 'Started') total = e.data.contentLength || 0;
    if (e.event === 'Progress') { recu += e.data.chunkLength; progression(total ? Math.round((recu / total) * 100) : null); }
  });
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}
