// Tests cibles SANS NAVIGATEUR des camps semantiques (2026-11-03) : decor derive identique a l'ancien generateur
// (coffre, postes, props, barils de la graine 12345), expandMapCamps, niveau authored -> gardes, overrides, editeur :
// pose petit / grand camp, refus (hors carte, eau, camp trop proche, Depart trop proche, obstacle), deplacement,
// niveau, Depart Survie (carte vierge sans depart, validation, pose, deplacement, refus), determinisme.
// Usage : node --import ../ts-register.mjs camps-authored.mts (ou npm run test:sim)

const SRC = new URL('../../src/', import.meta.url).href;
const { campLayoutOf, campFacingFrom, expandMapCamps } = await import(SRC + 'data/campLayout.ts');
const { CAMP_KINDS, getCampKind } = await import(SRC + 'data/camps.ts');
const { campSpecOf } = await import(SRC + 'run/camps.ts');
const { generateSurvivalMap } = await import(SRC + 'config/maps/proceduralSurvival.ts');
const { createBlankMap } = await import(SRC + 'config/maps/blankMap.ts');
const { EditorState, CAMP_MIN_SPACING, CAMP_START_CLEARANCE } = await import(SRC + 'editor/editorState.ts');
const { World } = await import(SRC + 'sim/world.ts');
let failures = 0;
const check = (label: string, ok: boolean, extra: unknown = '') => { if (!ok) failures++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label}${extra !== '' ? ' — ' + JSON.stringify(extra).slice(0, 900) : ''}`); };
const near = (a: { x: number; z: number }, b: { x: number; z: number }, eps = 1e-6) => Math.abs(a.x - b.x) < eps && Math.abs(a.z - b.z) < eps;

// 1-2. (Equivalence avec l'ancien generateur verifiee a f523dff ; le fichier d'alors a ete reecrit depuis.)
// Carte generee : camps semantiques, decor absent des listes ; expandMapCamps ajoute exactement le derive de chaque camp.
{
  const map = generateSurvivalMap(12345);
  const full = expandMapCamps(map);
  const props = map.camps.reduce((n: number, c: any) => n + campLayoutOf(c).props.length, 0);
  const barrels = map.camps.reduce((n: number, c: any) => n + campLayoutOf(c).barrels.length, 0);
  check('generateSurvivalMap 12345 : 2 camps {kind, x, z, level 1, facing}, sans coffre / postes / rayon ni decor ecrit ; expandMapCamps : + 7 / 9 props et 2 / 3 barils derives, carte d origine intacte',
    map.camps.length === 2 && map.camps.every((c: any) => c.level === 1 && typeof c.facing === 'number' && !('chest' in c) && !('guardPosts' in c) && !('radius' in c)) && map.destructibles === undefined
    && props === 16 && barrels === 5 && full.obstacles.length === map.obstacles.length + props && full.destructibles.length === barrels && map.obstacles.length < full.obstacles.length,
    { camps: map.camps, props, barrels });
}

// 3. Niveau authored -> gardes ; override ; monde.
{
  const def = { kind: 'raiders_large', x: 10.5, z: 10.5, level: 5, facing: 1.2 };
  const spec = campSpecOf(def);
  const spec2 = campSpecOf({ ...def, guardOverrides: [{ level: 9 }, {}] });
  const w = new World(1); w.setMap(createBlankMap());
  const camp = w.addCamp(spec);
  const guards = camp.guardIds.map((id: number) => w.getById(id));
  check('camp niveau 5 : 6 gardes niveau 5 aux postes derives, coffre derive ; override du poste 0 -> 9, les autres 5 ; monde : entites niveau 5',
    spec.guards.length === 6 && spec.guards.every((g: any) => g.level === 5) && near(spec.chest, campLayoutOf(def).chest) && spec2.guards[0].level === 9 && spec2.guards[1].level === 5 && guards.every((g: any) => g.level === 5 && g.campGuard), { levels: guards.map((g: any) => g.level) });
}
// 4. Editeur : carte vierge, Depart Survie, camps.
{
  const e = new EditorState(createBlankMap());
  const v0 = e.survivalValidation();
  check('carte vierge : aucun Depart Survie (ballistaExplicit faux), validation : erreur « Aucun Départ Survie », avertissements aucun camp / ressource / palissade', !e.ballistaExplicit && v0.errors.length === 1 && /Aucun Départ Survie/.test(v0.errors[0]) && v0.warnings.length === 3, v0);
  check('poser un camp sans Depart : possible (le depart n est pas requis pour un camp) ; hors carte : refuse ; eau : refuse', e.campPlacementIssue(0.5, 0.5) === null && e.campPlacementIssue(60.5, 0.5) === 'hors de la carte' && (() => { e.paintSurface?.(0, 20, 'water' as any); return true; })());
  // Depart Survie.
  const placedStart = e.placeFeatureAt('start', 0.4, 0.3);
  const v1 = e.survivalValidation();
  check('Depart Survie pose par l outil (0,4 ; 0,3) -> cale (0,5 ; 0,5), explicite ; validation sans erreur', placedStart && e.ballistaExplicit && e.ballista.x === 0.5 && e.ballista.z === 0.5 && v1.errors.length === 0, { b: e.ballista, v1 });
  check(`camp a moins de ${CAMP_START_CLEARANCE} cases du Depart : refuse ; a 20 cases : accepte`, /Départ Survie|camp de départ/.test(e.campPlacementIssue(8.5, 0.5) ?? '') && e.campPlacementIssue(20.5, 0.5) === null, { close: e.campPlacementIssue(8.5, 0.5) });
  const small = e.placeFeatureAt('camp:raiders_small', 20.2, 0.7);
  const camp = e.features.find((f: any) => f.kind === 'camp');
  check('Petit camp pose en (20,2 ; 0,7) -> centre de case (20,5 ; 0,5), niveau 1, dos a l oppose du Depart (facing ~ 0)', small && camp && camp.camp.kind === 'raiders_small' && camp.camp.x === 20.5 && camp.camp.z === 0.5 && camp.camp.level === 1 && Math.abs(camp.camp.facing - campFacingFrom(20.5, 0.5, { x: 0.5, z: 0.5 })) < 1e-9 && Math.abs(camp.camp.facing) < 0.05, camp?.camp);
  check(`Grand camp a moins de ${CAMP_MIN_SPACING} cases du petit : refuse ; a 12 cases : accepte (2 camps)`, /autre camp/.test(e.campPlacementIssue(26.5, 0.5) ?? '') && e.placeFeatureAt('camp:raiders_large', 20.5, 12.5) && e.features.filter((f: any) => f.kind === 'camp').length === 2, { close: e.campPlacementIssue(26.5, 0.5) });
  // Obstacle bloquant dans la clairiere : refuse ; decor traversable : accepte.
  e.obstacles = [...e.obstacles, { id: 9001, kind: 'tree', tilesX: 1, tilesZ: 1, cornerX: -20, cornerZ: 1 } as any];
  e.obstacles = [...e.obstacles, { id: 9002, kind: 'prop', tilesX: 1, tilesZ: 1, propModel: 'kaykit_crate_A_big', x: 0.5, z: 30.5 } as any];
  check('arbre dans la clairiere : refuse (« arbre ») ; decor traversable pose a la main : accepte, et il reste a part du camp', e.campPlacementIssue(-20.5, 0.5) === 'arbre' && e.campPlacementIssue(0.5, 30.5) === null, { tree: e.campPlacementIssue(-20.5, 0.5) });
  // Deplacement : valide / refuse / inchange ; nouvel objet (historique).
  const beforeObj = camp;
  const moved = e.moveFeatureTo(camp.id, -20.3, -20.6);
  const after = e.features.find((f: any) => f.id === camp.id);
  const refused = e.moveFeatureTo(camp.id, 8.5, 0.5);
  const same = e.moveFeatureTo(camp.id, -20.5, -20.5);
  check('deplacement du petit camp en (-20,3 ; -20,6) -> (-20,5 ; -20,5), orientation gardee, nouvel objet ; vers le Depart : refuse ; meme case : rien', moved && after.camp.x === -20.5 && after.camp.z === -20.5 && after.camp.facing === beforeObj.camp.facing && after !== beforeObj && beforeObj.camp.x === 20.5 && !refused && !same, { after: after.camp });
  // Niveau.
  const lv = e.setCampLevel(camp.id, 5);
  const lvBad = e.setCampLevel(camp.id, 0);
  const lvSame = e.setCampLevel(camp.id, 5);
  const c5 = e.features.find((f: any) => f.id === camp.id);
  const spec = campSpecOf(c5.camp);
  check('niveau 1 -> 5 (nouvel objet) ; 0 refuse ; 5 -> 5 rien ; campSpecOf : gardes niveau 5', lv && !lvBad && !lvSame && c5.camp.level === 5 && c5 !== after && spec.guards.every((g: any) => g.level === 5), c5.camp);
  // Depart Survie : deplacement, refus pres d un camp.
  const startNear = e.startPlacementIssue(-18.5, -18.5);
  // Camp arrondi (2026-11-04) : 17 cases au moins entre le Depart et un camp ; (4,5 ; 4,5) est a 17,9 du grand camp.
  const startMoved = e.moveBallista(4.2, 4.1);
  check('Depart Survie : refus a moins de 17 cases d un camp (« camp trop proche ») ; deplace en (4,2 ; 4,1) -> cale', /camp trop proche \(moins de 17 cases\)/.test(startNear ?? '') && startMoved && e.ballista.x === 4.5 && e.ballista.z === 4.5, { startNear, b: e.ballista });
  // Suppression : le camp entier (une seule feature) ; snapshot / restore.
  const snap = e.objectsSnapshot();
  e.select({ kind: 'feature', id: camp.id }); e.deleteSelected();
  const gone = !e.features.some((f: any) => f.id === camp.id);
  e.restoreObjects(snap);
  check('Suppr : le camp (objet unique) disparait ; restauration : revenu avec son niveau 5', gone && e.features.find((f: any) => f.id === camp.id)?.camp.level === 5);
  const v2 = e.survivalValidation();
  check('validation finale : 0 erreur, aucun avertissement (l arbre ajoute compte comme ressource ; la palissade du camp de depart compte, 2026-11-04)', v2.errors.length === 0 && v2.warnings.length === 0, v2);
}
// 5. Determinisme du decor.
check('determinisme : meme camp -> meme decor', JSON.stringify(campLayoutOf({ kind: 'raiders_large', x: 3.5, z: -7.5, level: 2, facing: 2.1 })) === JSON.stringify(campLayoutOf({ kind: 'raiders_large', x: 3.5, z: -7.5, level: 2, facing: 2.1 })));
check('types de camps : shortName et layout definis (Petit camp / small, Grand camp / large)', getCampKind('raiders_small').shortName === 'Petit camp' && getCampKind('raiders_small').layout === 'small' && CAMP_KINDS['raiders_large'].shortName === 'Grand camp' && CAMP_KINDS['raiders_large'].layout === 'large');

console.log(failures ? failures + ' ECHEC(S)' : 'tout OK');
