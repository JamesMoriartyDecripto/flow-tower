// Fills a Canva brand template with copy and photos, then exports PNG slides.
// Canva Connect API: autofill job -> design -> export job. Needs a user token on Canva Pro, Teams or Enterprise.
import { env } from 'node:process';

const API = 'https://api.canva.com/rest/v1';
const headers = { Authorization: `Bearer ${env.CANVA_TOKEN}`, 'Content-Type': 'application/json' };

type Field = { type: 'text'; text: string } | { type: 'image'; asset_id: string };

async function poll<T>(url: string, done: (j: any) => T | undefined, everyMs = 2000, max = 60): Promise<T> {
  for (let i = 0; i < max; i++) {
    const job = await (await fetch(url, { headers })).json();
    if (job.job?.status === 'failed') throw new Error(`Canva job failed: ${JSON.stringify(job.job.error)}`);
    const result = done(job);
    if (result) return result;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  throw new Error(`Canva job timed out: ${url}`);
}

export async function autofillCarousel(templateId: string, data: Record<string, Field>) {
  const start = await fetch(`${API}/autofills`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ brand_template_id: templateId, data }),
  });
  if (!start.ok) throw new Error(`autofill ${start.status}: ${await start.text()}`);
  const { job } = await start.json();

  const designId = await poll(`${API}/autofills/${job.id}`, (j) => j.job?.result?.design?.id);

  const exp = await fetch(`${API}/exports`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ design_id: designId, format: { type: 'png', width: 1080, height: 1350 } }),
  });
  const exportJob = (await exp.json()).job;
  const urls: string[] = await poll(`${API}/exports/${exportJob.id}`, (j) => j.job?.urls);

  // Export URLs are short-lived: the caller copies them to the media bucket straight away.
  return { designId, urls };
}
