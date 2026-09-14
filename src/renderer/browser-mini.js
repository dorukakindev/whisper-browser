for (const button of document.querySelectorAll('[data-action]')) button.addEventListener('click', async () => {
  try { const result = await window.mini.command(button.dataset.action); document.getElementById('miniStatus').textContent = result?.error || ''; }
  catch (_) { document.getElementById('miniStatus').textContent = 'Video komutu uygulanamadı.'; }
});
