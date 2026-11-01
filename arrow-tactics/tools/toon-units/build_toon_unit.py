"""Unites Toon RTS : GLB (un par unite) et textures partagees (une paire par source), depuis un pack Toon RTS.

Lance par Blender, sans interface (voir README.md) :

    blender -b --factory-startup --python-exit-code 1 --python build_toon_unit.py -- \
        --config units.json --out <dossier> [--unit human_footman --unit human_archer | --all]

Options : --texture 1024 (cote des textures), --catalogue <dossier> (GLB d'etude : toutes les pieces du
modele, separees, pour choisir un assemblage ; jamais dans le jeu), --atlas <dossier> (atlas de couleur
du pack en PNG, pour comparer), --rapport <fichier.json> (inventaire).

Une unite = une SOURCE (pack, FBX modulaire, atlas) + ses PIECES (noms d'objets du FBX ; `offhand_weapon` :
piece de main droite copiee en miroir dans la main gauche) + un dossier d'ANIMATIONS (tous ses clips sont
exportes, noms normalises ; `extra_animations` : quelques clips d'autres dossiers, renommes). Etapes :
 1. modele : FBX modulaire, sans les pieces non choisies ; pieces rigides (armes, bouclier, carquois :
    portees par un os) fusionnees dans le maillage skinne, poids 1 sur leur os porteur : un seul
    maillage, un seul materiau ; 4 influences au plus par sommet (glTF, Three.js) ;
 2. clips : chaque FBX d'animation a sa propre pose de repos et anime aussi l'objet armature (centre de
    gravite du Biped) : pose de chaque os recopiee en espace monde sur le squelette du modele, image
    par image (meme squelette, memes noms d'os) ; plages et boucles de l'import Unity du pack (.meta) ;
 3. export GLB sans image ; textures de la source (une fois) : atlas neutre et masque des zones de
    couleur d'equipe (pixels qui varient entre les atlas de couleur du pack).
"""
import argparse
import json
import os
import re
import sys

import bpy
import numpy as np
from mathutils import Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--config", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--unit", action="append", default=[])
ap.add_argument("--all", action="store_true")
ap.add_argument("--texture", type=int, default=1024)
ap.add_argument("--catalogue")
ap.add_argument("--atlas")
ap.add_argument("--rapport")
args = ap.parse_args(argv)
# Chemins absolus : Blender ne resout pas un chemin relatif a l'enregistrement d'une image.
args.out = os.path.abspath(args.out)
with open(args.config, encoding="utf-8") as f:
    CONFIG = json.load(f)
UNITS = list(CONFIG["units"]) if args.all else args.unit
FPS = 30
PIECE_SLOTS = ("head", "body", "arms", "legs", "shoulderpads", "weapon", "offhand")
rapport = {"blender": bpy.app.version_string, "unites": {}, "textures": {}}


def source_of(name):
    src = CONFIG["sources"][name]
    return {**src, "model_path": os.path.join(src["pack"], src["model"])}


def pieces_of(unit):
    """Noms d'objets du FBX : emplacements standard (une piece ou rien), `extras` (liste), puis les outils
    (`tools`, maillages separes)."""
    names = [unit["pieces"].get(slot) for slot in PIECE_SLOTS]
    return [n for n in names if n] + list(unit["pieces"].get("extras", [])) + list(unit["pieces"].get("tools", {}).values())


def mirror_to_left_hand(arm, piece):
    """`offhand_weapon` : copie en miroir (plan sagittal des mains du squelette, normales retournees) d'une
    piece de main droite, portee par la main gauche. Renvoie le nom de la copie."""
    src = bpy.data.objects.get(piece)
    if src is None or src.parent_type != "BONE" or src.parent_bone != "R_hand_container":
        raise SystemExit(f"offhand_weapon : {piece} n'est pas une piece de main droite (R_hand_container)")
    right, left = (arm.matrix_world @ arm.data.bones[n].head_local for n in ("Bip001 R Hand", "Bip001 L Hand"))
    n = (right - left).normalized()
    mid = (right + left) / 2
    reflect = Matrix([[(1 if i == j else 0) - 2 * n[i] * n[j] for j in range(3)] for i in range(3)]).to_4x4()
    mirror = Matrix.Translation(mid) @ reflect @ Matrix.Translation(-mid)
    copy = src.copy()
    copy.data = src.data.copy()
    copy.name = piece + "_gauche"
    bpy.context.scene.collection.objects.link(copy)
    copy.parent = None
    copy.data.transform(mirror @ src.matrix_world)
    copy.data.flip_normals()
    copy.matrix_world = Matrix.Identity(4)
    copy.parent = arm
    copy.parent_type = "BONE"
    copy.parent_bone = "L_hand_container"
    copy.matrix_world = Matrix.Identity(4)
    return copy.name


def clip_name(fbx_file):
    """`WK_infantry_07_attack_A.FBX` -> `attackA` ; `WK_mage_11_cast_B` -> `castB` ;
    `WK_cavalry_spear_07_attack` -> `attack` (dossier au nom en plusieurs mots)."""
    stem = os.path.splitext(os.path.basename(fbx_file))[0]
    match = re.match(r"^[^_]+_(?:[^_]+_)+?\d+_(.+)$", stem)
    words = (match.group(1) if match else stem).split("_")
    return words[0].lower() + "".join(w[:1].upper() + w[1:] for w in words[1:])


def unity_clip_settings(fbx_path):
    """Plage et boucle du clip dans l'import Unity du pack (.meta : firstFrame, lastFrame, loopTime)."""
    with open(fbx_path + ".meta", encoding="utf-8") as f:
        text = f.read()
    grab = lambda key: float(re.search(r"\n\s+%s: ([-\d.]+)" % key, text).group(1))
    return {"premiere": grab("firstFrame"), "derniere": grab("lastFrame"), "boucle": grab("loopTime") == 1}


def import_model(source):
    """FBX modulaire, a la pose de repos, sans action."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    bpy.ops.import_scene.fbx(filepath=source["model_path"])
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    arm.animation_data_clear()
    for act in list(bpy.data.actions):
        bpy.data.actions.remove(act)
    arm.data.pose_position = "REST"
    bpy.context.view_layer.update()
    return arm


def keep_pieces(arm, names):
    """Ne garde que `names` (erreur si une piece manque) ; pieces rigides converties en pieces skinnees."""
    missing = [n for n in names if n not in bpy.data.objects]
    if missing:
        raise SystemExit(f"Pieces absentes du FBX : {missing}")
    for obj in list(bpy.data.objects):
        if obj != arm and obj.name not in names:
            bpy.data.objects.remove(obj, do_unlink=True)
    pieces = [bpy.data.objects[n] for n in names]
    carriers = {obj.name: obj.parent_bone for obj in pieces if obj.parent_type == "BONE"}
    for obj in pieces:
        if obj.parent_type != "BONE":
            continue
        # A sa place de la pose de repos, poids 1 sur l'os porteur.
        world = obj.matrix_world.copy()
        group = obj.vertex_groups.new(name=obj.parent_bone)
        group.add(range(len(obj.data.vertices)), 1.0, "REPLACE")
        obj.parent = arm
        obj.parent_type = "OBJECT"
        obj.matrix_world = world
        obj.modifiers.new("Armature", "ARMATURE").object = arm
    for obj in pieces:
        obj.hide_render = False
        for uv in list(obj.data.uv_layers)[1:]:
            obj.data.uv_layers.remove(uv)
    return pieces, carriers


def prepare_mesh(obj, material):
    """Un materiau sans image ; 4 influences au plus par sommet."""
    obj.data.materials.clear()
    obj.data.materials.append(material)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    before = max((sum(1 for g in v.groups if g.weight > 0) for v in obj.data.vertices), default=0)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    return before


def clean_materials(material):
    for mat in list(bpy.data.materials):
        if mat != material:
            bpy.data.materials.remove(mat)
    for img in list(bpy.data.images):
        bpy.data.images.remove(img)


def bake_clips(arm, folder, only=None, rename=None):
    """Tous les clips du dossier (ou `only`), recibles en espace monde sur `arm`, une piste NLA chacun.
    `rename` ({clip: nouveau nom}) : seulement ces clips, renommes (`extra_animations`)."""
    rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
    arm_inv = arm.matrix_world.inverted()
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    arm.animation_data_create()
    arm.data.pose_position = "POSE"
    clips = {}
    files = sorted(f for f in os.listdir(folder) if f.upper().endswith(".FBX"))
    for fbx_file in files:
        name = clip_name(fbx_file)
        if only and name not in only:
            continue
        if rename is not None:
            if name not in rename:
                continue
            name = rename[name]
        path = os.path.join(folder, fbx_file)
        settings = unity_clip_settings(path)
        before = set(bpy.data.objects)
        bpy.ops.import_scene.fbx(filepath=path)
        imported = [o for o in bpy.data.objects if o not in before]
        src = next(o for o in imported if o.type == "ARMATURE")
        src_action = src.animation_data.action
        first, last = int(settings["premiere"]) + 1, int(settings["derniere"]) + 1
        action = bpy.data.actions.new(name)
        arm.animation_data.action = action
        animated = [b for b in arm.data.bones if b.name in src.pose.bones]
        previous = {}
        for frame in range(first, last + 1):
            bpy.context.scene.frame_set(frame)
            # Pose voulue de chaque os, repere de l'armature du modele (objet anime du clip compris).
            pose = {b.name: arm_inv @ src.matrix_world @ src.pose.bones[b.name].matrix for b in animated}
            for b in animated:
                parent = b.parent
                if parent is None:
                    basis = rest[b.name].inverted() @ pose[b.name]
                else:
                    parent_pose = pose.get(parent.name, rest[parent.name])
                    basis = (rest[parent.name].inverted() @ rest[b.name]).inverted() @ parent_pose.inverted() @ pose[b.name]
                loc, rot, scale = basis.decompose()
                if b.name in previous and rot.dot(previous[b.name]) < 0:
                    rot.negate()
                previous[b.name] = rot
                pb = arm.pose.bones[b.name]
                pb.location, pb.rotation_quaternion, pb.scale = loc, rot, scale
                for prop in ("location", "rotation_quaternion", "scale"):
                    pb.keyframe_insert(prop, frame=frame - first)
        action.use_frame_range = True
        action.frame_start, action.frame_end = 0, last - first
        action.use_fake_user = True
        arm.animation_data.nla_tracks.new().strips.new(name, 0, action)
        arm.animation_data.action = None
        clips[name] = {"fichier": fbx_file, "images": last - first + 1, "duree_s": round((last - first) / FPS, 3), "boucle": settings["boucle"]}
        for obj in imported:
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.actions.remove(src_action)
    for pb in arm.pose.bones:
        pb.location, pb.rotation_quaternion, pb.scale = (0, 0, 0), (1, 0, 0, 0), (1, 1, 1)
    return clips


def export_glb(path, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_image_format="NONE", export_materials="EXPORT",
        export_animations=True, export_animation_mode="ACTIONS", export_anim_slide_to_zero=True, export_force_sampling=True,
        export_optimize_animation_size=True, export_skins=True, export_influence_nb=4, export_def_bones=False,
        export_yup=True, export_texcoords=True, export_normals=True, export_tangents=False, export_leaf_bone=False,
        export_reset_pose_bones=True, export_rest_position_armature=True, export_apply=False,
    )


def build_unit(name):
    unit = CONFIG["units"][name]
    source = source_of(unit["source"])
    arm = import_model(source)
    names = pieces_of(unit)
    offhand = unit["pieces"].get("offhand_weapon")
    if offhand:
        names.append(mirror_to_left_hand(arm, offhand))
    # Outils (`tools` : {nom: piece}) : maillages SEPARES nommes `tool_<nom>`, affiches ou masques par le jeu
    # (changement d'outil) ; `tool_scale` ({nom: facteur}) agrandit un outil autour de sa prise (origine).
    tools = unit["pieces"].get("tools", {})
    for tool, factor in unit["pieces"].get("tool_scale", {}).items():
        bpy.data.objects[tools[tool]].scale *= factor
    bpy.context.view_layer.update()
    pieces, carriers = keep_pieces(arm, names)
    stats = {p.name: {"sommets": len(p.data.vertices), "os_porteur": carriers.get(p.name)} for p in pieces}
    # Fusion : un maillage (le corps actif garde ses modificateurs : armature).
    body = bpy.data.objects.get(unit["pieces"].get("body")) or pieces[0]
    tool_objects = {tool: bpy.data.objects[piece] for tool, piece in tools.items()}
    bpy.ops.object.select_all(action="DESELECT")
    for obj in pieces:
        if obj not in tool_objects.values():
            obj.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    mesh = bpy.context.view_layer.objects.active
    mesh.name = mesh.data.name = name
    # Parties a texture propre (`material_parts` : {materiau du FBX: partie}, ex. le cheval de la cavalerie
    # humaine, hors de l'atlas des unites) : maillages SEPARES nommes `part_<partie>`, texture choisie par le jeu.
    parts = {}
    for mat_name, part in unit.get("material_parts", {}).items():
        index = next((i for i, m in enumerate(mesh.data.materials) if m and m.name.split(".")[0] == mat_name), None)
        if index is None:
            raise SystemExit(f"Materiau absent de {name} : {mat_name}")
        bpy.ops.object.select_all(action="DESELECT")
        mesh.select_set(True)
        bpy.context.view_layer.objects.active = mesh
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="DESELECT")
        mesh.active_material_index = index
        bpy.ops.object.material_slot_select()
        bpy.ops.mesh.separate(type="SELECTED")
        bpy.ops.object.mode_set(mode="OBJECT")
        separated = next(o for o in bpy.context.selected_objects if o != mesh)
        separated.name = separated.data.name = "part_" + part
        parts[part] = separated
    material = bpy.data.materials.new(name)
    for tool, obj in tool_objects.items():
        obj.name = obj.data.name = "tool_" + tool
        prepare_mesh(obj, material)
        obj.data.calc_loop_triangles()
    for obj in parts.values():
        prepare_mesh(obj, material)
        obj.data.calc_loop_triangles()
    influences = prepare_mesh(mesh, material)
    clean_materials(material)
    mesh.data.calc_loop_triangles()
    clips = bake_clips(arm, os.path.join(source["pack"], unit["animations"]))
    # Clips pris dans d'autres dossiers, renommes : {"folder": ..., "clips": {"attack": "attackDouble"}}.
    for extra in unit.get("extra_animations", []):
        clips.update(bake_clips(arm, os.path.join(source["pack"], extra["folder"]), rename=extra["clips"]))
    path = os.path.join(args.out, name + ".glb")
    export_glb(path, [arm, mesh, *tool_objects.values(), *parts.values()])
    rapport["unites"][name] = {
        "pieces": stats, "outils": {t: {"triangles": len(o.data.loop_triangles)} for t, o in tool_objects.items()},
        "parties": {p: {"triangles": len(o.data.loop_triangles)} for p, o in parts.items()}, "sommets": len(mesh.data.vertices), "triangles": len(mesh.data.loop_triangles), "os": len(arm.data.bones),
        "influences_max_source": influences, "clips": clips, "glb": path, "octets": os.path.getsize(path), "textures": source["textures"],
    }


def build_catalogue(source_name):
    """GLB d'etude : toutes les pieces du FBX modulaire, separees, avec les clips de repos (choix d'un assemblage)."""
    source = source_of(source_name)
    arm = import_model(source)
    names = [o.name for o in bpy.data.objects if o.type == "MESH"]
    pieces, _ = keep_pieces(arm, names)
    material = bpy.data.materials.new("catalogue")
    for obj in pieces:
        prepare_mesh(obj, material)
    clean_materials(material)
    clips = bake_clips(arm, os.path.join(source["pack"], source["catalogue_animations"]), only={"idle", "combatIdle"})
    os.makedirs(args.catalogue, exist_ok=True)
    path = os.path.join(args.catalogue, source_name + "_catalogue.glb")
    export_glb(path, [arm, *pieces])
    rapport["catalogue"] = {"glb": path, "pieces": sorted(names), "clips": sorted(clips)}


def load_pixels(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)


def save_png(pixels, path):
    """`pixels` (h, w, 4, valeurs brutes 0..1, sans gestion des couleurs) en PNG RVB au cote args.texture
    (moyenne par blocs) ; une image plus petite garde sa taille (texture de cheval, 512)."""
    h, w = pixels.shape[:2]
    s = min(args.texture, h)
    small = pixels.reshape(s, h // s, s, w // s, 4).mean(axis=(1, 3))
    img = bpy.data.images.new(os.path.basename(path), s, s, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(small.astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def build_textures(source_name):
    """Atlas neutre et masque des zones d'equipe d'une source : `<textures>_albedo.png`, `_team_mask.png`."""
    source = source_of(source_name)
    folder = os.path.join(source["pack"], source["team_color_atlases"])
    atlases = {f: load_pixels(os.path.join(folder, f)) for f in sorted(os.listdir(folder)) if f.lower().endswith(".tga")}
    stack = np.stack([a[..., :3] for a in atlases.values()])
    team = ((stack.max(0) - stack.min(0)).max(-1) > 2 / 255).astype(np.float32)
    mask = np.ones(stack.shape[1:3] + (4,), np.float32)
    mask[..., 0] = mask[..., 1] = mask[..., 2] = team
    prefix = os.path.join(args.out, source["textures"])
    save_png(atlases[source["neutral_atlas"]], prefix + "_albedo.png")
    save_png(mask, prefix + "_team_mask.png")
    rapport["textures"][source["textures"]] = {n: os.path.getsize(prefix + n) for n in ("_albedo.png", "_team_mask.png")}
    # Textures de parties (`extra_textures` : {partie: image du pack}), sans teinte d'equipe : `<textures>_<partie>.png`.
    for part, rel in source.get("extra_textures", {}).items():
        save_png(load_pixels(os.path.join(source["pack"], rel)), prefix + "_" + part + ".png")
        rapport["textures"][source["textures"]]["_" + part + ".png"] = os.path.getsize(prefix + "_" + part + ".png")
    if args.atlas:
        os.makedirs(args.atlas, exist_ok=True)
        for f, px in atlases.items():
            save_png(px, os.path.join(args.atlas, os.path.splitext(f)[0] + ".png"))


os.makedirs(args.out, exist_ok=True)
for unit_name in UNITS:
    build_unit(unit_name)
for source_name in sorted({CONFIG["units"][u]["source"] for u in UNITS}):
    build_textures(source_name)
if args.catalogue:
    for source_name in CONFIG["sources"]:
        build_catalogue(source_name)
if args.rapport:
    with open(args.rapport, "w", encoding="utf-8") as f:
        json.dump(rapport, f, ensure_ascii=False, indent=1)
print("TOON_UNITS_OK", json.dumps({u: {k: v for k, v in r.items() if k in ("triangles", "sommets", "os", "octets")} for u, r in rapport["unites"].items()}))
