# Emberwake art bible (locked 2026-09-19, direction B)

Every art reviewer grades against this page and `config/style-guide.json`.

## Pillars (visual)
1. **Warm light in a cold world.** Ember orange is the only saturated hue; it means fire, safety, progress.
2. **Readable at a glance.** Silhouettes first. Players must tell friend, foe and resource apart at 30 m.
3. **Hand-made, not hand-wavy.** Painterly surfaces, visible brush gradients, crisp shapes underneath.

## Palette ("ember & slate")
- Slate base: #2B3138, #46505A, #6E7A85 - stone, metal, the sky at dusk.
- Ember accents: #F28C28, #FFB347, #FFD27A - beacons, sparks, interactables only.
- Moss/drift support: #5C7A5A, #A8B59A - foliage, never brighter than ember.
- No pure black or pure white in albedo. Value range 0.04-0.85.

## Shape language
- Keeper and allies: rounded, stable, wide base. Enemies (Cinder Wisp): sharp, top-heavy, asymmetric.
- Architecture: chunky stone, timber braces, oversized rivets. 15% exaggerated proportions.
- Islands: flat tops for play, eroded undersides, hanging roots and chains.

## Surfaces
- Roughness 0.55-0.9 for everything except wet stone (0.35) and polished brass (0.25).
- Edge wear from the curvature bake, warm-tinted on metal near beacons.
- Emissive only in `M_Ember_Emissive`; intensity animated by gameplay, not baked.

## Do / don't
- DO keep 3 value groups per asset (dark, mid, light) readable in greyscale.
- DO use hand-painted gradients bottom-dark to top-light on large shapes.
- DON'T add ember colour to non-interactive props.
- DON'T use photo textures, real logos, real-world brands or traced references.
