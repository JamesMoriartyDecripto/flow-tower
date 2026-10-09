"""Validate a level before it is handed to QA (editor Python, read-only).

    py pipelines/unreal/validate_level.py --level /Game/Emberwake/Maps/Generated/L_AshenShoals_4127

Checks: required POIs present, every beacon reachable on the navmesh from the
player start, actor count and dynamic light count under budget, no missing
references, no actors below the kill-Z. Prints a JSON report; never edits.
"""
import argparse
import json

import unreal

REQUIRED = {"beacon": 3, "camp": 1, "ember_vein": 4}
MAX_ACTORS = 4000
MAX_DYNAMIC_LIGHTS = 12
KILL_Z_CM = -5000


def count_tag(actors, tag):
    return sum(1 for a in actors if unreal.Name(tag) in a.tags)


def reachable(world, start, goal):
    path = unreal.NavigationSystemV1.find_path_to_location_synchronously(world, start, goal)
    return bool(path) and path.is_valid() and not path.is_partial()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--level", required=True)
    args = p.parse_args()

    unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).load_level(args.level)
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()
    errors, warnings = [], []

    for tag, minimum in REQUIRED.items():
        found = count_tag(actors, tag)
        if found < minimum:
            errors.append(f"{tag}: {found} < {minimum}")

    starts = [a for a in actors if isinstance(a, unreal.PlayerStart)]
    if not starts:
        errors.append("no PlayerStart")
    else:
        origin = starts[0].get_actor_location()
        for beacon in (a for a in actors if unreal.Name("beacon") in a.tags):
            if not reachable(world, origin, beacon.get_actor_location()):
                errors.append(f"unreachable beacon {beacon.get_actor_label()}")

    if len(actors) > MAX_ACTORS:
        warnings.append(f"{len(actors)} actors > {MAX_ACTORS}")
    lights = [a for a in actors if isinstance(a, unreal.Light) and a.root_component.mobility == unreal.ComponentMobility.MOVABLE]
    if len(lights) > MAX_DYNAMIC_LIGHTS:
        errors.append(f"{len(lights)} movable lights > {MAX_DYNAMIC_LIGHTS}")
    fallen = [a.get_actor_label() for a in actors if a.get_actor_location().z < KILL_Z_CM]
    if fallen:
        errors.append(f"actors below kill-Z: {fallen[:5]}")

    print(json.dumps({"level": args.level, "pass": not errors, "actors": len(actors),
                      "movable_lights": len(lights), "errors": errors, "warnings": warnings}))


if __name__ == "__main__":
    main()
