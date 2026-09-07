(function initBrowserWorkflowRecorder(root) {
  const WORKFLOW_VERSION = 1;
  const MAX_WORKFLOW_STEPS = 100;
  const MAX_SAVED_WORKFLOWS = 12;
  const ALLOWED_SETTINGS_PAGES = new Set(['browser-subtitles', 'browser-view', 'browser-diagnostics']);
  const ALLOWED_SUBTITLE_MODES = new Set(['off', 'source', 'translation', 'both']);
  const STEP_COMMANDS = new Set([
    'openSettings', 'loadSourceTrack', 'translateTrack', 'completeTranslation', 'setSubtitleMode',
  ]);

  function clean(value, max = 240) {
    return String(value == null ? '' : value).trim().slice(0, max);
  }

  function normalizeContext(raw = {}) {
    return {
      tabId: clean(raw.tabId || raw.id, 128),
      generation: Math.max(0, Math.trunc(Number(raw.generation) || 0)),
      mediaId: clean(raw.mediaId || raw.mediaIdentity, 320),
    };
  }

  function contextsMatch(left, right) {
    const a = normalizeContext(left);
    const b = normalizeContext(right);
    return !!a.tabId && a.tabId === b.tabId && a.generation === b.generation && a.mediaId === b.mediaId;
  }

  function normalizeStep(raw = {}) {
    const command = clean(raw.command, 64);
    if (!STEP_COMMANDS.has(command)) return null;
    const input = raw.args && typeof raw.args === 'object' && !Array.isArray(raw.args) ? raw.args : {};
    let args = {};
    if (command === 'openSettings') {
      const page = clean(input.page, 64);
      if (!ALLOWED_SETTINGS_PAGES.has(page)) return null;
      args = { page };
    } else if (command === 'setSubtitleMode') {
      const mode = clean(input.mode, 32);
      if (!ALLOWED_SUBTITLE_MODES.has(mode)) return null;
      args = { mode };
    } else {
      const trackId = clean(input.trackId, 256);
      if (!trackId) return null;
      const language = clean(input.language, 35).toLowerCase().replace(/[^a-z0-9-]/g, '');
      const role = clean(input.role, 32).toLowerCase().replace(/[^a-z0-9-]/g, '');
      const label = clean(input.label, 120);
      args = { trackId, ...(language ? { language } : {}), ...(role ? { role } : {}),
        ...(label ? { label } : {}) };
    }
    return { command, args };
  }

  function resolveWorkflowTrack(rawStep, rawTracks) {
    const step = normalizeStep(rawStep);
    const tracks = Array.isArray(rawTracks) ? rawTracks : [];
    if (!step || !['loadSourceTrack', 'translateTrack', 'completeTranslation'].includes(step.command)) return null;
    const exact = tracks.find((track) => String(track?.id || '') === step.args.trackId);
    if (exact) return exact;
    const language = clean(step.args.language, 35).toLowerCase();
    const role = clean(step.args.role, 32).toLowerCase();
    const label = clean(step.args.label, 120).toLowerCase();
    if (!language && !label) return null;
    const candidates = tracks.filter((track) => !role
      || clean(track?.role || (track?.format === 'translation' ? 'translation' : 'source'), 32).toLowerCase() === role);
    return candidates.find((track) => language && clean(track?.language, 35).toLowerCase() === language
      && label && clean(track?.label, 120).toLowerCase() === label)
      || candidates.find((track) => language && clean(track?.language, 35).toLowerCase() === language)
      || candidates.find((track) => label && clean(track?.label, 120).toLowerCase() === label)
      || null;
  }

  function normalizeWorkflow(raw = {}) {
    const steps = (Array.isArray(raw.steps) ? raw.steps : [])
      .slice(0, MAX_WORKFLOW_STEPS).map(normalizeStep).filter(Boolean);
    if (!steps.length) return null;
    return {
      version: WORKFLOW_VERSION,
      id: clean(raw.id, 128) || `workflow-${Date.now().toString(36)}`,
      title: clean(raw.title, 120) || 'Tarayıcı iş akışı',
      createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now(),
      mediaIdentity: clean(raw.mediaIdentity, 320),
      steps,
    };
  }

  function normalizeWorkflowLibrary(raw) {
    const result = [];
    const ids = new Set();
    for (const candidate of (Array.isArray(raw) ? raw : []).slice(-MAX_SAVED_WORKFLOWS * 2)) {
      const workflow = normalizeWorkflow(candidate);
      if (!workflow || ids.has(workflow.id)) continue;
      ids.add(workflow.id);
      result.push(workflow);
    }
    return result.sort((a, b) => a.createdAt - b.createdAt).slice(-MAX_SAVED_WORKFLOWS);
  }

  class BrowserWorkflowRecorder {
    constructor() { this.active = null; }

    get recording() { return !!this.active; }

    start(context, title = '') {
      if (this.active) throw Object.assign(new Error('Workflow kaydı zaten açık.'), { code: 'EWORKFLOW_RECORDING' });
      const normalized = normalizeContext(context);
      if (!normalized.tabId) throw Object.assign(new Error('Kaydedilecek etkin tarayıcı sekmesi yok.'), { code: 'EWORKFLOW_CONTEXT' });
      this.active = {
        version: WORKFLOW_VERSION,
        id: `workflow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        title: clean(title, 120) || 'Tarayıcı iş akışı',
        createdAt: Date.now(),
        mediaIdentity: normalized.mediaId,
        steps: [],
      };
      return { ...this.active, steps: [] };
    }

    record(command, args = {}) {
      if (!this.active) return false;
      const step = normalizeStep({ command, args });
      if (!step) return false;
      if (this.active.steps.length >= MAX_WORKFLOW_STEPS) {
        throw Object.assign(new Error(`Workflow en fazla ${MAX_WORKFLOW_STEPS} adım içerebilir.`), { code: 'EWORKFLOW_LIMIT' });
      }
      this.active.steps.push(step);
      return true;
    }

    stop() {
      const current = this.active;
      this.active = null;
      return current ? normalizeWorkflow(current) : null;
    }

    cancel() { this.active = null; }
  }

  class BrowserWorkflowPlayer {
    constructor() { this.controller = null; }

    get playing() { return !!this.controller; }

    cancel(reason = 'Workflow kullanıcı tarafından iptal edildi.') {
      if (!this.controller) return false;
      this.controller.abort(reason);
      return true;
    }

    async play(rawWorkflow, options = {}) {
      if (this.controller) throw Object.assign(new Error('Başka bir workflow zaten oynatılıyor.'), { code: 'EWORKFLOW_BUSY' });
      const workflow = normalizeWorkflow(rawWorkflow);
      if (!workflow) throw Object.assign(new Error('Workflow boş veya geçersiz.'), { code: 'EWORKFLOW_INVALID' });
      if (typeof options.getContext !== 'function' || typeof options.execute !== 'function') {
        throw Object.assign(new Error('Workflow oynatma bağdaştırıcısı eksik.'), { code: 'EWORKFLOW_ADAPTER' });
      }
      const initial = normalizeContext(options.getContext());
      if (!initial.tabId || (workflow.mediaIdentity && initial.mediaId !== workflow.mediaIdentity)) {
        throw Object.assign(new Error('Workflow farklı bir medya bağlamına ait.'), { code: 'EWORKFLOW_MEDIA' });
      }
      const controller = new AbortController();
      this.controller = controller;
      let completed = 0;
      try {
        for (const step of workflow.steps) {
          if (controller.signal.aborted) throw Object.assign(new Error(String(controller.signal.reason || 'Workflow iptal edildi.')), { code: 'EWORKFLOW_ABORTED' });
          if (!contextsMatch(initial, options.getContext())) {
            throw Object.assign(new Error('Sekme, sayfa veya medya değişti; workflow durduruldu.'), { code: 'EWORKFLOW_STALE' });
          }
          await options.execute(step, { signal: controller.signal, index: completed, total: workflow.steps.length });
          if (!contextsMatch(initial, options.getContext())) {
            throw Object.assign(new Error('Komut sırasında sekme, sayfa veya medya değişti; workflow durduruldu.'), { code: 'EWORKFLOW_STALE' });
          }
          completed++;
        }
        return { ok: true, completed, total: workflow.steps.length };
      } finally {
        if (this.controller === controller) this.controller = null;
      }
    }
  }

  const api = {
    BrowserWorkflowPlayer,
    BrowserWorkflowRecorder,
    MAX_SAVED_WORKFLOWS,
    MAX_WORKFLOW_STEPS,
    WORKFLOW_VERSION,
    contextsMatch,
    normalizeContext,
    normalizeStep,
    normalizeWorkflow,
    normalizeWorkflowLibrary,
    resolveWorkflowTrack,
  };
  if (typeof module !== 'undefined') module.exports = api;
  if (root) root.BrowserWorkflowRecorder = api;
})(typeof window !== 'undefined' ? window : null);
