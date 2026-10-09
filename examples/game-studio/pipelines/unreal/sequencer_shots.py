"""Build Level Sequences (cinematics, trailer shots) from a shot list JSON.

    py pipelines/unreal/sequencer_shots.py --shots marketing/trailer_shots.json --fps 30

Shot list format (written by the trailer-writer agent):
    [{"name": "SH010_Beacon", "duration_s": 4.0, "camera": [x, y, z, pitch, yaw, roll],
      "focal_mm": 35, "actor": "BP_Keeper_C_0", "anim": "/Game/.../A_Lantern_Raise"}]
"""
import argparse
import json

import unreal

FOLDER = "/Game/Emberwake/Cinematics"


def new_sequence(name, fps, frames):
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    seq = tools.create_asset(name, FOLDER, unreal.LevelSequence, unreal.LevelSequenceFactoryNew())
    seq.set_display_rate(unreal.FrameRate(fps, 1))
    seq.set_playback_start(0)
    seq.set_playback_end(frames)
    return seq


def add_camera(seq, shot, frames):
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    x, y, z, pitch, yaw, roll = shot["camera"]
    cam = actors.spawn_actor_from_class(unreal.CineCameraActor, unreal.Vector(x, y, z), unreal.Rotator(roll, pitch, yaw))
    cam.get_cine_camera_component().set_editor_property("current_focal_length", shot.get("focal_mm", 35))
    binding = seq.add_possessable(cam)
    cuts = seq.add_track(unreal.MovieSceneCameraCutTrack)
    section = cuts.add_section()
    section.set_range(0, frames)
    section.set_camera_binding_id(seq.get_binding_id(binding))
    return cam


def add_animation(seq, shot, frames):
    if not shot.get("actor") or not shot.get("anim"):
        return
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    actor = next((a for a in actors.get_all_level_actors() if a.get_name() == shot["actor"]), None)
    if actor is None:
        unreal.log_warning(f"actor {shot['actor']} not in level, skipping animation")
        return
    binding = seq.add_possessable(actor.get_component_by_class(unreal.SkeletalMeshComponent))
    track = binding.add_track(unreal.MovieSceneSkeletalAnimationTrack)
    section = track.add_section()
    section.set_range(0, frames)
    params = section.get_editor_property("params")
    params.set_editor_property("animation", unreal.load_asset(shot["anim"]))
    section.set_editor_property("params", params)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--shots", required=True)
    p.add_argument("--fps", type=int, default=30)
    args = p.parse_args()

    with open(args.shots) as fh:
        shots = json.load(fh)
    created = []
    for shot in shots:
        frames = round(shot["duration_s"] * args.fps)
        seq = new_sequence(shot["name"], args.fps, frames)
        add_camera(seq, shot, frames)
        add_animation(seq, shot, frames)
        unreal.EditorAssetLibrary.save_loaded_asset(seq)
        created.append(seq.get_path_name())
    print(json.dumps({"ok": True, "sequences": created, "total_s": sum(s["duration_s"] for s in shots)}))


if __name__ == "__main__":
    main()
