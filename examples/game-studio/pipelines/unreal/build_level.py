"""Build an island level from a world-gen layout (heightmap + POIs).

    py pipelines/unreal/build_level.py --layout build/worldgen/seed_4127/layout.json

layout.json is produced by pipelines/worldgen/poi_placement.py. Creates the level,
imports the heightmap as a Landscape, spawns POI blueprints at their transforms and
adds a NavMeshBoundsVolume covering the walkable area.
"""
import argparse
import json

import unreal

POI_CLASSES = {
    "beacon": "/Game/Emberwake/Blueprints/BP_Beacon",
    "wreck": "/Game/Emberwake/Blueprints/BP_Wreck",
    "ember_vein": "/Game/Emberwake/Blueprints/BP_EmberVein",
    "wisp_nest": "/Game/Emberwake/Blueprints/BP_WispNest",
    "camp": "/Game/Emberwake/Blueprints/BP_Camp",
    "bridge_anchor": "/Game/Emberwake/Blueprints/BP_BridgeAnchor",
}


def new_level(path):
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    if not unreal.EditorAssetLibrary.does_asset_exist(path):
        levels.new_level_from_template(path, "/Game/Emberwake/Maps/Templates/L_Island_Template")
    levels.load_level(path)


def import_landscape(heightmap, size_m):
    subsystem = unreal.get_editor_subsystem(unreal.LandscapeEditorSubsystem) if hasattr(unreal, "LandscapeEditorSubsystem") else None
    if subsystem:
        return subsystem.import_heightmap(heightmap, unreal.Vector(0, 0, 0), size_m * 100)
    # Fallback for older editors: spawn the landscape proxy from the template and let the artist reimport
    unreal.log_warning("LandscapeEditorSubsystem unavailable, heightmap must be imported manually")
    return None


def spawn_pois(pois):
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    spawned = []
    for poi in pois:
        cls = unreal.EditorAssetLibrary.load_blueprint_class(POI_CLASSES[poi["type"]])
        x, y, z = (c * 100 for c in poi["position_m"])  # metres -> cm
        actor = actors.spawn_actor_from_class(cls, unreal.Vector(x, y, z), unreal.Rotator(0, 0, poi.get("yaw", 0)))
        actor.set_actor_label(f"{poi['type']}_{poi['id']}")
        actor.tags = [unreal.Name(poi["type"]), unreal.Name(f"island_{poi['island']}")]
        spawned.append(actor)
    return spawned


def add_navmesh(size_m, height_m):
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    vol = actors.spawn_actor_from_class(unreal.NavMeshBoundsVolume, unreal.Vector(0, 0, height_m * 50))
    vol.set_actor_scale3d(unreal.Vector(size_m, size_m, height_m))  # brush is 200 cm, scale halves to metres
    unreal.SystemLibrary.execute_console_command(None, "RebuildNavigation")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--layout", required=True)
    args = p.parse_args()
    with open(args.layout) as fh:
        layout = json.load(fh)

    level_path = f"/Game/Emberwake/Maps/Generated/L_{layout['biome']}_{layout['seed']}"
    new_level(level_path)
    landscape = import_landscape(layout["heightmap"], layout["size_m"])
    pois = spawn_pois(layout["pois"])
    add_navmesh(layout["size_m"], layout["max_height_m"])
    unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
    print(json.dumps({"ok": True, "level": level_path, "landscape": bool(landscape), "pois": len(pois)}))


if __name__ == "__main__":
    main()
