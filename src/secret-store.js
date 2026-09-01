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
  return String(fieldPath || '').split('.').map((part) => part.trim()).filter(Boolean);
}

function getPath(object, fieldPath) {
  let current = object;
  for (const part of pathParts(fieldPath)) {
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
  for (const field of fields) {
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
    try {
      if (!this.filePath || !this.fs.existsSync(this.filePath)) return { ok: true, secrets: {} };
      const parsed = JSON.parse(this.fs.readFileSync(this.filePath, 'utf8'));
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
    try {
      for (const field of this.fields) {
        const value = secrets && secrets[field];
        if (typeof value !== 'string' || !value) continue;
        entries[field] = this.safeStorage.encryptString(value).toString('base64');
      }
      const dir = path.dirname(this.filePath);
      const temp = path.join(dir, `.${path.basename(this.filePath)}.${process.pid}.${Date.now()}.tmp`);
      this.fs.mkdirSync(dir, { recursive: true });
      this.fs.writeFileSync(temp, `${JSON.stringify({ version: SECRET_STORE_VERSION, entries }, null, 2)}\n`, 'utf8');
      if (this.fs.existsSync(this.filePath)) {
        try { this.fs.copyFileSync(this.filePath, `${this.filePath}.bak`); } catch (_) {}
      }
      this.fs.renameSync(temp, this.filePath);
      return { ok: true, stored: Object.keys(entries) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  saveFromSettings(settings) {
    const { publicSettings, secrets } = splitSettingsSecrets(settings, this.fields);
    if (!Object.keys(secrets).length) return { ok: true, publicSettings, stored: [] };
    const current = this.load();
    if (!current.ok && !current.unavailable && !current.partial) return { ...current, publicSettings };
    const saved = this.save({ ...(current.secrets || {}), ...secrets });
    return { ...saved, publicSettings };
  }

  withSecrets(settings) {
    const loaded = this.load();
    return {
      ...loaded,
      settings: mergeSettingsSecrets(settings, loaded.secrets, this.fields),
    };
  }

  forExport(settings, options = {}) {
    if (options.includeSecrets === true) return cloneJson(settings);
    return splitSettingsSecrets(settings, this.fields).publicSettings;
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
