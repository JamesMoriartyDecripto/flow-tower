import type { ReactNode } from 'react';
import { useLive } from '../live';
import { resetPrefs, usePrefs, type DefaultView } from '../settings';
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
      {options.map(([v, label]) => <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>)}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange(v: boolean): void }) {
  return <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} onClick={() => onChange(!on)}><i /></button>;
}

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
                <button key={t.id} className={`theme ${prefs.theme === t.id ? 'on' : ''}`} onClick={() => prefs.setTheme(t.id)}
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
              <button className="btn" onClick={resetPrefs}>Reset to defaults</button>
            </Row>
          </section>
        </div>
      </div>
    </div>
  );
}
