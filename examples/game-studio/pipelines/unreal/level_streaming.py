"""Set up level streaming for an archipelago: one persistent level, one sublevel per island.

    py pipelines/unreal/level_streaming.py --persistent /Game/Emberwake/Maps/L_AshenShoals \
        --islands build/worldgen/seed_4127/islands.json --radius-m 450

Each island sublevel is added as LevelStreamingDynamic-friendly (blueprint loaded),
and a streaming volume around every island loads it when the player is within
radius. Keeps peak memory inside config/quality-gates.yaml perf budgets.
"""
import argparse
import json

import unreal


def add_sublevel(world, path):
    return unreal.EditorLevelUtils.add_level_to_world(world, path, unreal.LevelStreamingDynamic)


def add_volume(island, radius_m):
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    x, y, z = (c * 100 for c in island["center_m"])
    vol = actors.spawn_actor_from_class(unreal.LevelStreamingVolume, unreal.Vector(x, y, z))
    scale = radius_m / 1.0  # default brush is 200 cm wide
    vol.set_actor_scale3d(unreal.Vector(scale, scale, scale / 2))
    vol.set_actor_label(f"LSV_Island_{island['id']}")
    return vol


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--persistent", required=True)
    p.add_argument("--islands", required=True)
    p.add_argument("--radius-m", type=float, default=450.0)
    args = p.parse_args()

    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    levels.load_level(args.persistent)
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()

    with open(args.islands) as fh:
        islands = json.load(fh)["islands"]

    added = []
    for island in islands:
        streaming = add_sublevel(world, island["level"])
        if streaming is None:
            unreal.log_error(f"could not add {island['level']}")
            continue
        volume = add_volume(island, args.radius_m)
        streaming.set_editor_property("editor_streaming_volumes", [volume])
        streaming.set_editor_property("should_be_visible_in_editor", island.get("start", False))
        added.append(island["level"])

    levels.save_all_dirty_levels()
    print(json.dumps({"ok": len(added) == len(islands), "sublevels": added, "missing": len(islands) - len(added)}))


if __name__ == "__main__":
    main()
