document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-health');
  const out = document.getElementById('result');
  if (!btn || !out) return;

  const pretty = (obj) => JSON.stringify(obj, null, 2);

  btn.addEventListener('click', async () => {
    out.textContent = 'Requesting /api/health…';
    try {
      const res = await fetch('/api/health');
      const text = await res.text();
      try {
        out.textContent = pretty(JSON.parse(text));
      } catch {
        out.textContent = text;
      }
    } catch (err) {
      out.textContent = 'Request failed: ' + String(err);
    }
  });
});

