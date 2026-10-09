import type { ReactNode } from 'react';
import { useLive } from '../live';
import { resetPrefs, usePrefs, type DefaultView, type Flow, type Visibility } from '../settings';
import type { FlowStyle } from '../scene/Particles';
import { useStore, type Quality } from '../store';
import { THEMES } from '../themes';

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div><div className="set-label">{label}</div>{hint && <div className="set-hint">{hint}</div>}</div>
      <div className="set-control">{children}</div>
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange(v: T): void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)} title={`Set to ${label}`}>{label}</button>)}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange(v: boolean): void }) {
  return <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} onClick={() => onChange(!on)} title={on ? 'On: click to turn off' : 'Off: click to turn on'}><i /></button>;
}

/** Style, size, speed and density of one animated flow (between nodes or between layers). */
function FlowControls({ title, hint, flow, onChange }: { title: string; hint: string; flow: Flow; onChange(f: Flow): void }) {
  const patch = (p: Partial<Flow>) => onChange({ ...flow, ...p });
  const slider = (key: 'size' | 'speed' | 'density', min: number, max: number, step: number) => (
    <>
      <input type="range" min={min} max={max} step={step} value={flow[key]} disabled={!flow.on} onChange={(e) => patch({ [key]: Number(e.target.value) })} />
      <span className="mono dim">{flow[key].toFixed(1)}×</span>
    </>
  );
  return (
    <div className="set-group">
      <Row label={title} hint={hint}><Toggle on={flow.on} onChange={(on) => patch({ on })} /></Row>
      <Row label="Style" hint="Dots: round beads · Comets: streaks pointing where the flow goes · Pulses: beads that breathe.">
        <Seg<FlowStyle> value={flow.style} options={[['dots', 'Dots'], ['comets', 'Comets'], ['pulses', 'Pulses']]} onChange={(style) => patch({ style })} />
      </Row>
      <Row label="Size">{slider('size', 0.4, 3, 0.1)}</Row>
      <Row label="Speed">{slider('speed', 0.2, 3, 0.1)}</Row>
      <Row label="Density" hint="Particles per connection.">{slider('density', 0.5, 4, 0.5)}</Row>
    </div>
  );
}

const VISIBILITY: [keyof Visibility, string, string][] = [
  ['edgeLabels', 'Edge labels', 'Text on the arrows inside a layer (e.g. "spawn", "max 3").'],
  ['nodeTags', 'Node subtitles', 'Type, model and runtime under each node name.'],
  ['links', 'Links between layers', 'The curves that connect nodes of different layers.'],
  ['grid', 'Layer grid', 'The fine grid drawn on each glass plate.'],
  ['pillars', 'Tower frame', 'Vertical lines at the corners of the tower.'],
  ['base', 'Base rings', 'The arc-reactor rings under the tower.'],
  ['scanner', 'Scanner', 'The frame sweeping up and down the tower.'],
  ['sparkles', 'Sparkles', 'Floating dust particles around the tower.'],
];

/** Settings page: theme, performance budget, effects, view, live behaviour, HUD. Saved per browser. */
export function Settings() {
  const prefs = usePrefs();
  const ui = useStore();
  const live = useLive();
  if (!prefs.open) return null;
  const close = () => prefs.set({ open: false });

  return (
    <div className="overlay" onClick={close}>
      <div className="panel settings" onClick={(e) => e.stopPropagation()}>
        <header>
          <div className="title">Settings</div>
          <button className="close" onClick={close} title="Close (Esc)">✕</button>
        </header>
        <div className="set-body">
          <section>
            <h3>Theme</h3>
            <div className="themes">
              {THEMES.map((t) => (
                <button key={t.id} className={`theme ${prefs.theme === t.id ? 'on' : ''}`} onClick={() => prefs.setTheme(t.id)} title={`Use the ${t.name} theme`}
                  style={{ background: t.bg, borderColor: prefs.theme === t.id ? t.accent : undefined }}>
                  <span className="sw" style={{ background: t.accent }} />
                  <span className="sw" style={{ background: t.accent2 }} />
                  <span className="sw" style={{ background: t.live.run }} />
                  <span className="name" style={{ color: t.text }}>{t.name}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>Performance</h3>
            <Row label="Quality" hint="eco: 20 fps cap, no post-processing, zero GPU when idle · balanced: 30 fps · high: 60 fps, full effects">
              <Seg<Quality> value={ui.quality} options={[['eco', 'Eco'], ['balanced', 'Balanced'], ['high', 'High']]} onChange={(quality) => ui.set({ quality })} />
            </Row>
            <Row label="Ambient animations" hint="Scanner, sparkles, rotating base, flow particles. Off = the scene only moves when something happens.">
              <Toggle on={ui.animations} onChange={(animations) => ui.set({ animations })} />
            </Row>
            <Row label="Flow particles" hint="Dots travelling along edges (needs ambient animations).">
              <Toggle on={ui.particles} onChange={(particles) => ui.set({ particles })} />
            </Row>
            <Row label="Glow" hint="Bloom strength on highlights and live activity (no effect in eco).">
              <input type="range" min={0} max={2} step={0.1} value={prefs.bloom} onChange={(e) => prefs.set({ bloom: Number(e.target.value) })} />
              <span className="mono dim">{prefs.bloom.toFixed(1)}×</span>
            </Row>
          </section>

          <section>
            <h3>Appearance</h3>
            <Row label="Layer transparency" hint="Glass plates of the layers: lower = see the flows below, higher = calmer, more readable. The focused layer always stays nearly opaque.">
              <input type="range" min={0.1} max={0.95} step={0.05} value={prefs.plateOpacity} onChange={(e) => prefs.set({ plateOpacity: Number(e.target.value) })} />
              <span className="mono dim">{Math.round((1 - prefs.plateOpacity) * 100)}%</span>
            </Row>
          </section>

          <section>
            <h3>Animations</h3>
            <FlowControls title="Flow between nodes" hint="Particles along the arrows inside each layer."
              flow={prefs.flowNodes} onChange={(flowNodes) => prefs.set({ flowNodes })} />
            <FlowControls title="Flow between layers" hint="Particles along the curves that connect layers."
              flow={prefs.flowLayers} onChange={(flowLayers) => prefs.set({ flowLayers })} />
          </section>

          <section>
            <h3>Visible by default</h3>
            {VISIBILITY.map(([key, label, hint]) => (
              <Row key={key} label={label} hint={hint}>
                <Toggle on={prefs.show[key]} onChange={(on) => prefs.set({ show: { ...prefs.show, [key]: on } })} />
              </Row>
            ))}
          </section>

          <section>
            <h3>View</h3>
            <Row label="Default view" hint="Auto: map for towers with more than 10 layers, tower otherwise. Switch any time with M.">
              <Seg<DefaultView> value={prefs.defaultView} options={[['auto', 'Auto'], ['tower', 'Tower'], ['map', 'Map']]} onChange={(defaultView) => prefs.set({ defaultView })} />
            </Row>
            <Row label="Layer spacing" hint="Tower view only.">
              <input type="range" min={0.4} max={2.5} step={0.05} value={ui.explode} onChange={(e) => ui.set({ explode: Number(e.target.value) })} />
            </Row>
            <Row label="Auto-orbit" hint="Slowly rotates the tower (keeps rendering while on).">
              <Toggle on={ui.autoRotate} onChange={(autoRotate) => ui.set({ autoRotate })} />
            </Row>
          </section>

          <section>
            <h3>Live</h3>
            <Row label="Spotlight" hint="While the live feed is open, dim everything that is not active.">
              <Toggle on={live.spotlight} onChange={(spotlight) => live.setOption({ spotlight })} />
            </Row>
            <Row label="Follow activity" hint="The camera moves to the layer of the latest event.">
              <Toggle on={live.follow} onChange={(follow) => live.setOption({ follow })} />
            </Row>
            <Row label="Live chips" hint="Labels above running / failing nodes.">
              <Toggle on={prefs.chips} onChange={(chips) => prefs.set({ chips })} />
            </Row>
          </section>

          <section>
            <h3>Interface</h3>
            <Row label="Controls hint" hint="The shortcut line at the bottom of the screen.">
              <Toggle on={prefs.hints} onChange={(hints) => prefs.set({ hints })} />
            </Row>
            <Row label="Reset" hint="Forget all saved preferences in this browser.">
              <button className="btn" onClick={resetPrefs} title="Forget all saved preferences in this browser and reload">Reset to defaults</button>
            </Row>
          </section>
        </div>
      </div>
    </div>
  );
}
