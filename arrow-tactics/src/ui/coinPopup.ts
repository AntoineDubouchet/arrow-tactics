/**
 * Petit texte flottant "+N or"/"-N or" pres d'un element ancre, meme langage
 * visuel que le texte "raté" flottant du combat (voir combatOverlay.ts,
 * spawnMissText) : monte et s'estompe, puis se retire tout seul. Demande
 * d'Antoine (2026-08-08) : une animation doit jouer a CHAQUE entree d'argent
 * (vente, a terme kills/bonus de vague), et une petite animation distincte
 * pour les sorties (achats) — un seul texte colore differemment (or/rouge)
 * suffit pour les deux cas, pas besoin de deux animations separees.
 *
 * Ancre sur un element HTML (pas une position monde comme spawnMissText) :
 * utilisable aussi bien pres de la zone "Vendre" pendant le placement que
 * pres de l'affichage d'or de la boutique.
 */
export function spawnCoinPopup(anchor: HTMLElement, amount: number): void {
  if (amount === 0) return;

  const el = document.createElement('div');
  el.className = `coin-popup ${amount > 0 ? 'coin-popup--gain' : 'coin-popup--loss'}`;
  el.textContent = `${amount > 0 ? '+' : ''}${amount} or`;

  const rect = anchor.getBoundingClientRect();
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top = `${rect.top}px`;

  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}
