const fs = require('fs');
const path = require('path');

const SECRET_STORE_VERSION = 1;
const DEFAULT_SECRET_FIELDS = Object.freeze([
  'hfToken',
  'llm.apiKey',
  'translate.apiKey',
  'manga.apiKey',
]);

function cloneJson(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : {};
}

function pathParts(fieldPath) {
  const parts = String(fieldPath || '').split('.').map((part) => part.trim()).filter(Boolean);
  return parts.some((part) => ['__proto__', 'constructor', 'prototype'].includes(part)) ? [] : parts;
}

function clearedFields(settings, fields) {
  return new Set((Array.isArray(settings?.clearedSecretFields) ? settings.clearedSecretFields : [])
    .filter((field) => fields.includes(field)));
}

function redactExport(value) {
  if (Array.isArray(value)) return value.map(redactExport);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['__proto__', 'constructor', 'prototype'].includes(key)
      && !/(?:api[_-]?key|token|password|passwd|secret|authorization|cookie|credential)$/i.test(key))
    .map(([key, child]) => [key, redactExport(child)]));
}

function getPath(object, fieldPath) {
  const parts = pathParts(fieldPath);
  if (!parts.length) return undefined;
  let current = object;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

function setPath(object, fieldPath, value) {
  const parts = pathParts(fieldPath);
  if (!parts.length) return object;
  let current = object;
  for (let index = 0; index < parts.length - 1; index++) {
    const part = parts[index];
    if (!current[part] || typeof current[part] !== 'object' || Array.isArray(current[part])) current[part] = {};
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
  return object;
}

function deletePath(object, fieldPath) {
  const parts = pathParts(fieldPath);
  if (!parts.length) return;
  let current = object;
  for (let index = 0; index < parts.length - 1; index++) {
    current = current && current[parts[index]];
    if (!current || typeof current !== 'object') return;
  }
  delete current[parts[parts.length - 1]];
}

function splitSettingsSecrets(settings, fields = DEFAULT_SECRET_FIELDS) {
  const publicSettings = cloneJson(settings);
  const secrets = {};
  for (const field of fields) {
    const value = getPath(publicSettings, field);
    // Boş dize de anlamlıdır: kullanıcı kayıtlı bir anahtarı temizliyor olabilir.
    // Alan hiç yoksa mevcut kasadaki değere dokunulmaz.
    if (typeof value === 'string') secrets[field] = value;
    deletePath(publicSettings, field);
  }
  return { publicSettings, secrets };
}

function mergeSettingsSecrets(settings, secrets, fields = DEFAULT_SECRET_FIELDS) {
  const merged = cloneJson(settings);
  const cleared = clearedFields(settings, fields);
  for (const field of fields) {
    if (cleared.has(field)) { deletePath(merged, field); continue; }
    const value = secrets && secrets[field];
    if (typeof value === 'string' && value) setPath(merged, field, value);
  }
  return merged;
}

function secretStorePath(app) {
  return path.join(app.getPath('userData'), 'secrets.safe.json');
}

class SafeSecretStore {
  constructor(options = {}) {
    this.safeStorage = options.safeStorage;
    this.filePath = options.filePath;
    this.fs = options.fsModule || fs;
    this.fields = options.fields || DEFAULT_SECRET_FIELDS;
  }

  isAvailable() {
    try {
      return !!(this.safeStorage && typeof this.safeStorage.isEncryptionAvailable === 'function'
        && this.safeStorage.isEncryptionAvailable());
    } catch (_) {
      return false;
    }
  }

  load() {
    if (!this.isAvailable()) return { ok: false, unavailable: true, secrets: {} };
    if (!this.filePath) return { ok: true, secrets: {} };
    let failure = null;
    for (const candidate of [this.filePath, `${this.filePath}.bak`]) {
      if (!this.fs.existsSync(candidate)) continue;
      const loaded = this.loadFile(candidate);
      // A parseable primary is authoritative, even for intentionally cleared
      // keys or partial decryption. Do not resurrect deleted keys from .bak.
      if (loaded.ok || loaded.partial || loaded.errors?.length) {
        return { ...loaded, recovered: candidate !== this.filePath };
      }
      failure = loaded;
    }
    return failure || { ok: true, secrets: {} };
  }

  loadFile(candidate) {
    try {
      const parsed = JSON.parse(this.fs.readFileSync(candidate, 'utf8'));
      if (!parsed || parsed.version !== SECRET_STORE_VERSION || !parsed.entries || typeof parsed.entries !== 'object') {
        return { ok: false, error: 'Güvenli anahtar deposu biçimi desteklenmiyor.', secrets: {} };
      }
      const secrets = {};
      const errors = [];
      for (const field of this.fields) {
        const encoded = parsed.entries[field];
        if (typeof encoded !== 'string' || !encoded) continue;
        try {
          const value = this.safeStorage.decryptString(Buffer.from(encoded, 'base64'));
          if (value) secrets[field] = value;
        } catch (error) {
          errors.push({ field, error: error.message });
        }
      }
      return {
        ok: errors.length === 0,
        partial: errors.length > 0 && Object.keys(secrets).length > 0,
        error: errors.length ? `${errors.length} gizli alan çözülemedi.` : undefined,
        errors,
        secrets,
      };
    } catch (error) {
      return { ok: false, error: error.message, secrets: {} };
    }
  }

  save(secrets) {
    if (!this.isAvailable()) return { ok: false, unavailable: true, error: 'İşletim sistemi güvenli deposu kullanılamıyor.' };
    const entries = {};
    let temp;
    try {
      for (const field of this.fields) {
        const value = secrets && secrets[field];
        if (typeof value !== 'string' || !value) continue;
        entries[field] = this.safeStorage.encryptString(value).toString('base64');
      }
      const dir = path.dirname(this.filePath);
      temp = path.join(dir, `.${path.basename(this.filePath)}.${process.pid}.${Date.now()}.tmp`);
      this.fs.mkdirSync(dir, { recursive: true });
      this.fs.writeFileSync(temp, `${JSON.stringify({ version: SECRET_STORE_VERSION, entries }, null, 2)}\n`, { encoding: 'utf8', flush: true });
      if (this.fs.existsSync(this.filePath) && this.loadFile(this.filePath).ok) {
        this.fs.copyFileSync(this.filePath, `${this.filePath}.bak`);
      }
      this.fs.renameSync(temp, this.filePath);
      return { ok: true, stored: Object.keys(entries) };
    } catch (error) {
      return { ok: false, error: error.message };
    } finally {
      if (temp) { try { if (this.fs.existsSync(temp)) this.fs.unlinkSync(temp); } catch (_) {} }
    }
  }

  saveFromSettings(settings) {
    const { publicSettings, secrets } = splitSettingsSecrets(settings, this.fields);
    const cleared = clearedFields(settings, this.fields);
    for (const [field, value] of Object.entries(secrets)) if (value === '') cleared.add(field);
    const recordClears = () => {
      if (cleared.size) publicSettings.clearedSecretFields = [...cleared];
      else delete publicSettings.clearedSecretFields;
    };
    recordClears();
    if (!Object.keys(secrets).length) return { ok: true, publicSettings, stored: [] };
    const current = this.load();
    if (!current.ok && !current.unavailable && !current.partial) return { ...current, publicSettings };
    const next = { ...(current.secrets || {}) };
    for (const field of cleared) delete next[field];
    Object.assign(next, secrets);
    const saved = this.save(next);
    // Silme niyetini açık ayarlarda sakla: kasa kapalıyken eski şifreli kayıt
    // kalabilir. Yeni anahtar BAŞARIYLA yazılmadan bu işareti kaldırma.
    if (saved.ok) {
      for (const [field, value] of Object.entries(secrets)) if (value) cleared.delete(field);
      recordClears();
    }
    return { ...saved, publicSettings };
  }

  withSecrets(settings) {
    const loaded = this.load();
    return {
      ...loaded,
      settings: mergeSettingsSecrets(settings, loaded.secrets, this.fields),
    };
  }

  forExport(settings) {
    // Dışa aktarma yüzeyi hiçbir bayrakla sırları açamaz. Anahtarların taşınması
    // gerekirse bunun açık kullanıcı onaylı, ayrı bir kasa akışı olması gerekir.
    return redactExport(splitSettingsSecrets(settings, this.fields).publicSettings);
  }
}

module.exports = {
  DEFAULT_SECRET_FIELDS,
  SECRET_STORE_VERSION,
  SafeSecretStore,
  getPath,
  mergeSettingsSecrets,
  secretStorePath,
  setPath,
  splitSettingsSecrets,
};
