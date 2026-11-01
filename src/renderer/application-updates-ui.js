(() => {
  'use strict';
  const t = (en, tr) => window.UiLocale?.get?.() === 'tr' ? tr : en;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const occlusion = () => { if (typeof syncBrowserOcclusion === 'function') void syncBrowserOcclusion(); };
  let current = null;
  function open() {
    if (current) { current.dialog.focus(); return; }
    const opener = document.activeElement;
    const dialog = el('dialog', 'apu-dialog'); dialog.id = 'applicationUpdatesDialog'; dialog.dataset.uiUntranslated = '';
    dialog.setAttribute('aria-labelledby', 'apu-title');
    const session = { dialog, pending: false, result: null }; current = session;
    const alive = () => current === session && dialog.open;
    const button = (label, callback, cls = '') => { const node = el('button', cls, label); node.type = 'button'; node.onclick = callback; return node; };
    const header = el('header', 'apu-header'), title = el('h2', '', t('Application updates', 'Uygulama güncellemeleri')); title.id = 'apu-title';
    header.append(title, button(t('Close', 'Kapat'), () => dialog.close()));
    const body = el('div', 'apu-body');
    body.append(el('p', 'apu-muted', t('Check online for a newer version of this installation. Update only when your jobs are idle; the app will restart.', 'Bu kurulumun yeni sürümünü çevrimiçi denetleyin. Yalnız işler dururken güncelleyin; uygulama yeniden başlayacak.')));
    const versions = el('dl', 'apu-versions');
    const installed = el('dd', '', '—'), latest = el('dd', '', '—');
    versions.append(el('dt', '', t('Installed', 'Kurulu')), installed, el('dt', '', t('Latest', 'En yeni')), latest); body.append(versions);
    const status = el('p', 'apu-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); body.append(status);
    body.append(el('p', 'apu-muted', t('Your profile, media files and downloaded models are kept. This updates the current installation; it does not install GPU tools on another computer.', 'Profiliniz, medya dosyalarınız ve indirilen modelleriniz korunur. Bu işlem mevcut kurulumu günceller; başka bilgisayara GPU araçlarını kurmaz.')));
    const actions = el('footer', 'apu-actions');
    const check = button(t('Check for updates', 'Güncellemeleri denetle'), () => void request('check'));
    const install = button(t('Update & restart', 'Güncelle ve yeniden başlat'), () => { if (!install.disabled) void request('install'); }, 'apu-install');
    actions.append(check, install); dialog.append(header, body, actions);
    const failures = {
      busy: t('Finish or stop active jobs, then check again.', 'Etkin işleri bitirin veya durdurun, ardından yeniden denetleyin.'),
      offline: t('Could not connect. Check your internet connection and try again.', 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip yeniden deneyin.'),
      unsupported: t('This installation cannot update itself.', 'Bu kurulum kendini güncelleyemiyor.'),
      dirty: t('Local source changes prevent this update.', 'Yerel kaynak değişiklikleri güncellemeyi engelliyor.'),
      divergent: t('This installation needs a manual source update.', 'Bu kurulumun kaynakları elle güncellenmeli.'),
      'runtime-change': t('This version needs new runtime dependencies. Update the installation manually.', 'Bu sürüm yeni çalışma zamanı bağımlılıkları gerektiriyor. Kurulumu elle güncelleyin.'),
      'remote-changed': t('The update source changed. Check for updates again.', 'Güncelleme kaynağı değişti. Güncellemeleri yeniden denetleyin.'),
      stale: t('The available version changed. Check for updates again.', 'Kullanılabilir sürüm değişti. Güncellemeleri yeniden denetleyin.'),
      'check-required': t('Check for updates before installing.', 'Kurulumdan önce güncellemeleri denetleyin.'),
      failed: t('The update could not finish. Check again or update manually.', 'Güncelleme tamamlanamadı. Yeniden denetleyin veya elle güncelleyin.')
    };
    function render() {
      const result = session.result || {}, busy = session.pending || ['busy', 'checking', 'installing', 'restarting'].includes(result.state);
      installed.textContent = String(result.current || '—'); latest.textContent = String(result.latest || '—');
      check.disabled = busy;
      install.disabled = busy || !result.ok || !result.available || result.canInstall !== true;
      dialog.setAttribute('aria-busy', String(session.pending));
      const previousFailure = session.action === 'status' && result.lastResult?.ok === false;
      status.classList.toggle('apu-error', result.ok === false || previousFailure);
      if (session.pending) status.textContent = session.action === 'install' ? t('Updating… The app will restart when ready.', 'Güncelleniyor… Hazır olduğunda uygulama yeniden başlayacak.') : t('Checking…', 'Denetleniyor…');
      else if (result.ok === false) status.textContent = failures[result.error] || String(result.message || result.error || t('Update failed. Try checking again.', 'Güncelleme başarısız. Yeniden denetleyin.'));
      else if (previousFailure) status.textContent = t('The previous update did not finish. ', 'Önceki güncelleme tamamlanmadı. ') + (failures[result.lastResult.error] || failures.failed);
      else if (result.restartRequired) status.textContent = t('Update ready. Restarting the app…', 'Güncelleme hazır. Uygulama yeniden başlıyor…');
      else if (result.available) status.textContent = result.canInstall === true ? t('A new version is ready. Save your work before updating.', 'Yeni sürüm hazır. Güncellemeden önce çalışmanızı kaydedin.') : t('A new version is available. Finish active jobs before updating.', 'Yeni sürüm var. Güncellemeden önce etkin işleri bitirin.');
      else status.textContent = result.message || (session.action === 'check' ? t('You are up to date.', 'Güncelsiniz.') : t('Check online to find a newer version.', 'Yeni sürüm için çevrimiçi denetleyin.'));
    }
    async function request(action) {
      if (!alive() || session.pending) return;
      session.pending = true; session.action = action; render();
      try {
        const result = await window.api.applicationUpdates({ action });
        if (!alive()) return;
        session.result = result || { ok: false };
      } catch (error) {
        if (!alive()) return;
        session.result = { ok: false, message: error?.message || t('Could not check for updates.', 'Güncellemeler denetlenemedi.') };
      } finally { if (alive()) { session.pending = false; render(); } }
    }
    dialog.addEventListener('close', () => { if (current === session) current = null; dialog.remove(); occlusion(); if (opener?.isConnected) opener.focus({ preventScroll: true }); }, { once: true });
    document.body.append(dialog); render();
    try { dialog.showModal(); occlusion(); void request('status'); }
    catch (error) { current = null; dialog.remove(); occlusion(); throw error; }
  }
  window.ApplicationUpdatesUI = Object.freeze({ open });
})();
