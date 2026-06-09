// ═══════════════════════════════════════════════════════════
// MNLive — GitHub Auto-Save API (Vercel Serverless Function)
// File: /api/github.js
//
// Environment Variables (Vercel Dashboard এ set করো):
//   GITHUB_TOKEN  = ghp_xxxxxxxxxxxxxxxxxxxx
//   GITHUB_REPO   = username/repo-name       (e.g. maruf/mnlive)
//   ADMIN_PASSWORD = তোমার_secret_password
// ═══════════════════════════════════════════════════════════

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, password, filename, content } = req.body || {};

  // ── Password Check ──────────────────────────────────────
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD) return res.status(500).json({ error: 'Server misconfigured' });
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' });

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO  = process.env.GITHUB_REPO; // e.g. "maruf/mnlive"

  if (!GITHUB_TOKEN || !GITHUB_REPO) return res.status(500).json({ error: 'GitHub not configured' });

  const BASE = `https://api.github.com/repos/${GITHUB_REPO}/contents`;
  const HEADERS = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // ── ACTION: verify (just check password) ───────────────
  if (action === 'verify') {
    return res.status(200).json({ ok: true });
  }

  // ── ACTION: list (get all files) ────────────────────────
  if (action === 'list') {
    try {
      const r = await fetch(`${BASE}`, { headers: HEADERS });
      const files = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: files.message });
      // শুধু json/m3u files দেখাও
      const relevant = files.filter(f =>
        f.name.endsWith('.json') || f.name.endsWith('.m3u') || f.name.endsWith('.m3u8')
      ).map(f => ({ name: f.name, sha: f.sha, size: f.size, url: f.download_url }));
      return res.status(200).json({ ok: true, files: relevant });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── ACTION: upload (create or update a file) ────────────
  if (action === 'upload') {
    if (!filename || content === undefined) return res.status(400).json({ error: 'filename and content required' });
    // Sanitize filename — শুধু safe characters
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    try {
      // আগে existing SHA আনো (update-এর জন্য দরকার)
      let sha;
      const check = await fetch(`${BASE}/${safeName}`, { headers: HEADERS });
      if (check.ok) {
        const existing = await check.json();
        sha = existing.sha;
      }
      const body = {
        message: `MNLive Admin: update ${safeName}`,
        content: btoa(unescape(encodeURIComponent(content))), // UTF-8 safe base64
        ...(sha ? { sha } : {}),
      };
      const r = await fetch(`${BASE}/${safeName}`, {
        method: 'PUT', headers: HEADERS, body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: data.message });
      return res.status(200).json({ ok: true, sha: data.content?.sha, url: data.content?.download_url });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── ACTION: delete ──────────────────────────────────────
  if (action === 'delete') {
    if (!filename) return res.status(400).json({ error: 'filename required' });
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    try {
      // SHA আনো
      const check = await fetch(`${BASE}/${safeName}`, { headers: HEADERS });
      if (!check.ok) return res.status(404).json({ error: 'File not found' });
      const existing = await check.json();
      const r = await fetch(`${BASE}/${safeName}`, {
        method: 'DELETE', headers: HEADERS,
        body: JSON.stringify({ message: `MNLive Admin: delete ${safeName}`, sha: existing.sha }),
      });
      if (!r.ok) { const d = await r.json(); return res.status(r.status).json({ error: d.message }); }
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
}
