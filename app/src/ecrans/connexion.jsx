import { useEffect, useState } from 'preact/hooks';
import { LogIn, Network } from 'lucide-preact';
import { appel, ouvrirLien } from '../api.js';

export function ConnexionGitHub({ version, connecte }) {
  const [code, setCode] = useState(null);
  const [message, setMessage] = useState(null);

  const demarrer = async () => {
    setMessage(null);
    try {
      const c = await appel('/github/connexion', { corps: {} });
      setCode(c);
      ouvrirLien(c.adresse);
    } catch (e) { setMessage(e.message); }
  };

  useEffect(() => {
    if (!code) return undefined;
    let intervalle = (code.intervalle || 5) * 1000;
    let fini = false;
    const attendre = async () => {
      if (fini) return;
      try {
        const r = await appel('/github/attente', { corps: { attente: code.attente } });
        if (r.etat === 'connecte') { fini = true; connecte(); return; }
        if (r.etat === 'refusee') { fini = true; setCode(null); setMessage('Connexion refusée sur GitHub.'); return; }
        if (r.etat === 'expiree') { fini = true; setCode(null); setMessage('Le code a expiré : recommencer.'); return; }
        if (r.ralentir) intervalle += 5000;
      } catch (e) { setMessage(e.message); }
      setTimeout(attendre, intervalle);
    };
    const t = setTimeout(attendre, intervalle);
    return () => { fini = true; clearTimeout(t); };
  }, [code]);

  return (
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
      <div class="panneau" style="max-width:520px;width:100%;padding:36px;display:flex;flex-direction:column;gap:18px">
        <span class="logo" style="width:48px;height:48px;flex-basis:48px;border-radius:14px"><Network size={26} /></span>
        <h1>Bienvenue dans Watson</h1>
        <p class="doux">La connaissance métier de chaque projet vit dans un dépôt GitHub. Connecte ton compte pour ouvrir ou créer ces dépôts : Watson ne voit ni ne garde ton mot de passe.</p>
        {!code && <button class="bouton principal-b" onClick={demarrer}><LogIn size={18} /> Se connecter avec GitHub</button>}
        {code && (
          <div class="carte pile" style="align-items:flex-start">
            <span class="doux">Saisis ce code sur la page GitHub qui vient de s'ouvrir, puis autorise Watson :</span>
            <span class="code">{code.code}</span>
            <div class="ligne">
              <button class="bouton" onClick={() => navigator.clipboard?.writeText(code.code)}>Copier le code</button>
              <button class="bouton" onClick={() => ouvrirLien(code.adresse)}>Rouvrir la page GitHub</button>
            </div>
            <span class="petit doux">En attente de ta validation sur GitHub…</span>
          </div>
        )}
        {message && <p class="encart e-rouge">{message}</p>}
        <span class="petit doux">Watson {version}</span>
      </div>
    </div>
  );
}
