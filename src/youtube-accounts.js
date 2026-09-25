'use strict';

// YouTube çoklu-hesap durumu (SmartTube hesap menüsü modeli).
// Her hesap kendi refresh/access token çiftini taşır; oturum SafeSecretStore'a
// tek bir 'accounts' JSON blob'u + 'active_id' alanı olarak yazılır. Token'lar
// asla renderer'a çıkmaz — dışarıya yalnız accountList() çıktısı gider.

const ACCOUNT_FIELDS = ['refreshToken', 'accessToken', 'expiresAt', 'userName',
                        'userEmail', 'authMode', 'ephemeral'];

function sanitizeAccount(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const acct = {
    refreshToken: String(raw.refreshToken || '').slice(0, 2000),
    accessToken: String(raw.accessToken || '').slice(0, 4000),
    expiresAt: Number(raw.expiresAt) || 0,
    userName: String(raw.userName || '').slice(0, 200),
    userEmail: String(raw.userEmail || '').slice(0, 200),
    authMode: raw.authMode === 'tv' ? 'tv' : 'custom',
    ephemeral: !!raw.ephemeral,
  };
  return (acct.refreshToken || acct.accessToken) ? acct : null;
}

function accountIdFor(userEmail, userName, fallbackSeed) {
  const base = String(userEmail || userName || '').trim().toLowerCase();
  if (base) return base.slice(0, 120);
  // Kimlik belirsizse (me ucu alan dönmedi) kararlı 'unknown' id'de birleştir —
  // timestamp türetmek her girişte yeni yetim satır ekliyordu. Kanal id'si
  // biliniyorsa onu kullan (kullanıcı adı değişse bile kalıcı).
  const seed = String(fallbackSeed || '').trim();
  return `acct-${seed || 'unknown'}`;
}

// SafeSecretStore'dan gelen secrets -> {accounts, activeId}
// - s.accounts: JSON string (map). - s.active_id: aktif hesap id'si.
// - Eski tek-hesap şeması (flat refresh_token/user_name/...) burada migrasyona
//   uğrar; bir sonraki save yalnız yeni alanları yazar.
function migrateSecrets(s) {
  const out = { accounts: {}, activeId: '' };
  if (!s || typeof s !== 'object') return out;
  try {
    const parsed = JSON.parse(String(s.accounts || ''));
    if (parsed && typeof parsed === 'object') {
      for (const [id, raw] of Object.entries(parsed)) {
        const acct = sanitizeAccount(raw);
        if (acct) out.accounts[String(id).slice(0, 120)] = acct;
      }
    }
  } catch (_) { /* bozuk blob — flat migrasyona düş */ }
  const legacy = sanitizeAccount({
    refreshToken: s.refresh_token,
    userName: s.user_name,
    userEmail: s.user_email,
    authMode: s.auth_mode,
  });
  if (legacy) {
    const id = accountIdFor(legacy.userEmail, legacy.userName, 'legacy');
    out.accounts[id] = legacy;
  }
  const wanted = String(s.active_id || '');
  out.activeId = wanted && out.accounts[wanted] ? wanted
    : (Object.keys(out.accounts)[0] || '');
  return out;
}

// Giriş/token tazeleme sonrası hesap ekle-güncelle; aktif hesap yapar.
// patch: {refreshToken?, accessToken?, expiresIn?, userName?, userEmail?,
//         userId?, authMode?, ephemeral?} — refreshToken yoksa ephemeral
// oturum sayılır.
function upsertAccount(accounts, patch) {
  const id = accountIdFor(patch.userEmail, patch.userName, patch.userId);
  const prev = accounts[id] || {};
  // expiresIn ayrımı: sonlu ve >= 0 ise saygı görür (0 = "şimdi doluyor"),
  // NaN/negatif/belirsiz değer 3600 varsayımına devrilmez — güvenli yedek.
  const expiresIn = Number(patch.expiresIn);
  const next = {
    refreshToken: patch.refreshToken !== undefined
      ? String(patch.refreshToken || '').slice(0, 2000)
      : (prev.refreshToken || ''),
    accessToken: patch.accessToken !== undefined
      ? String(patch.accessToken || '').slice(0, 4000)
      : (prev.accessToken || ''),
    expiresAt: patch.expiresIn !== undefined
      ? Date.now() + (Number.isFinite(expiresIn) && expiresIn >= 0 ? expiresIn : 3600) * 1000
      : (Number(prev.expiresAt) || 0),
    userName: String(patch.userName !== undefined ? patch.userName : prev.userName || '').slice(0, 200),
    userEmail: String(patch.userEmail !== undefined ? patch.userEmail : prev.userEmail || '').slice(0, 200),
    authMode: patch.authMode || prev.authMode || 'custom',
  };
  // refresh_token'siz hesap geçicidir — bayrak türetilir, ayrıca söylemeye gerek yok.
  next.ephemeral = !next.refreshToken;
  accounts[id] = next;
  return { id, account: next, activeId: id };
}

// Hesap sil; aktif silindiyse sıradaki hesabı aktifleştir.
function removeAccount(accounts, activeId, id) {
  if (!accounts[id]) return activeId;
  delete accounts[id];
  if (activeId === id) {
    return Object.keys(accounts)[0] || '';
  }
  return activeId;
}

// Aktif hesap — yoksa null. "Girişli" sayılmak için refresh token veya
// geçerli ephemeral access token gerekir.
function activeAccount(accounts, activeId) {
  const acct = accounts[activeId];
  if (!acct) return null;
  if (acct.refreshToken) return acct;
  if (acct.ephemeral && acct.accessToken && Date.now() < acct.expiresAt) return acct;
  return null;
}

// Diske yazılacak görünüm — access_token/expiresAt KALICI DEĞİL (kısa ömürlü;
// R70-07 güvenlik sözleşmesi). refreshToken'siz (ephemeral) hesaplar da
// yeniden okumada düşer — doğası gereği süresi dolar.
function persistableAccounts(accounts) {
  const out = {};
  for (const [id, a] of Object.entries(accounts || {})) {
    if (!a || !a.refreshToken) continue;
    out[id] = {
      refreshToken: a.refreshToken,
      userName: a.userName || '',
      userEmail: a.userEmail || '',
      authMode: a.authMode === 'tv' ? 'tv' : 'custom',
    };
  }
  return out;
}

// Renderer'a giden güvenli görünüm — token/secret taşımaz.
function accountList(accounts, activeId) {
  return Object.entries(accounts).map(([id, a]) => ({
    id,
    userName: a.userName || '',
    userEmail: a.userEmail || '',
    active: id === activeId,
    ephemeral: !!a.ephemeral,
    stale: !a.refreshToken && !(a.ephemeral && a.accessToken && Date.now() < a.expiresAt),
  }));
}

module.exports = {
  ACCOUNT_FIELDS,
  sanitizeAccount,
  accountIdFor,
  migrateSecrets,
  upsertAccount,
  removeAccount,
  activeAccount,
  accountList,
};
