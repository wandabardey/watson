// Rendu Markdown simple et sûr (le texte est échappé avant toute mise en forme) : titres ###, paragraphes,
// listes à puces et numérotées, tableaux, gras, italique, code, et [À CONFIRMER] mis en évidence.

const echapper = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function enLigne(t) {
  return echapper(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, '$1<em>$2</em>')
    .replace(/\[(À CONFIRMER|A CONFIRMER)\]/gi, '<span class="a-confirmer">à confirmer</span>');
}

export function versHtml(md) {
  const lignes = (md || '').replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  const para = [];
  const fermerPara = () => { if (para.length) { out.push(`<p>${enLigne(para.join(' '))}</p>`); para.length = 0; } };
  while (i < lignes.length) {
    const l = lignes[i];
    const titre = l.match(/^(#{1,4})\s+(.*)$/);
    if (!l.trim()) { fermerPara(); i++; continue; }
    if (titre) { fermerPara(); const n = Math.min(4, Math.max(3, titre[1].length + 1)); out.push(`<h${n}>${enLigne(titre[2])}</h${n}>`); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(l)) {
      fermerPara();
      const rangs = [];
      while (i < lignes.length && /^\s*\|.*\|\s*$/.test(lignes[i])) { rangs.push(lignes[i].trim().slice(1, -1).split('|').map((c) => c.trim())); i++; }
      const corps = rangs.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
      const [tete, ...reste] = corps;
      out.push(`<table class="md-table"><thead><tr>${tete.map((c) => `<th>${enLigne(c)}</th>`).join('')}</tr></thead><tbody>${reste.map((r) => `<tr>${r.map((c) => `<td>${enLigne(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    const puce = /^\s*[-*•]\s+/, numero = /^\s*\d+[.)]\s+/;
    if (puce.test(l) || numero.test(l)) {
      fermerPara();
      const ordonnee = numero.test(l);
      const motif = ordonnee ? numero : puce;
      const items = [];
      while (i < lignes.length && (motif.test(lignes[i]) || (/^\s{2,}\S/.test(lignes[i]) && items.length))) {
        if (motif.test(lignes[i])) items.push(lignes[i].replace(motif, ''));
        else items[items.length - 1] += ' ' + lignes[i].trim();
        i++;
      }
      out.push(`<${ordonnee ? 'ol' : 'ul'}>${items.map((x) => `<li>${enLigne(x)}</li>`).join('')}</${ordonnee ? 'ol' : 'ul'}>`);
      continue;
    }
    para.push(l.trim());
    i++;
  }
  fermerPara();
  return out.join('');
}

export function Markdown({ texte, classe = '' }) {
  return <div class={`md ${classe}`} dangerouslySetInnerHTML={{ __html: versHtml(texte) }} />;
}
