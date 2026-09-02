const SHUAI_ROUTES = Object.freeze([
  'https://api.shuaiapi.com/v1',
  'https://oai.sb/v1',
  'https://api.oai.sb/v1',
  'https://cdn.shuaiapi.com/v1',
]);

const SHUAI_HOSTS = new Set(SHUAI_ROUTES.map((route) => new URL(route).hostname));

function normalizeEndpointBase(raw) {
  return String(raw || '').trim().replace(/\/+$/, '');
}

function resolveTranslationEndpoints(raw) {
  const selected = normalizeEndpointBase(raw) || SHUAI_ROUTES[0];
  let host = '';
  try { host = new URL(selected).hostname.toLowerCase(); } catch (_) {}
  if (!SHUAI_HOSTS.has(host)) return [selected];
  return [selected, ...SHUAI_ROUTES.filter((route) => normalizeEndpointBase(route) !== selected)];
}

function shouldFailoverTranslationStatus(status, options = {}) {
  const code = Number(status) || 0;
  // Shuai'nin dört adresi aynı sağlayıcının alias'larıdır. Bazı anahtarlar
  // geçiş dönemlerinde yalnız belirli gateway'de doğrulanabildiği için manga
  // isteğinde kimlik doğrulama yanıtını da diğer alias'la sınamak gerekir.
  // Varsayılan davranış değişmez; altyazı çağrıları 401/403'ü tekrarlamaz.
  if (options.sameProviderAliases && (code === 401 || code === 403)) return true;
  // 429 bir rota arızası değil, sağlayıcı/anahtar kotasıdır. Aynı Shuai
  // sağlayıcısının alias'larını art arda denemek kotayı daha da sıkıştırır;
  // yeniden deneme gecikmesini çağrı scheduler'ı yönetir.
  return code === 0 || code === 404 || code === 408 || code === 425 || code >= 500;
}

module.exports = {
  SHUAI_ROUTES,
  resolveTranslationEndpoints,
  shouldFailoverTranslationStatus,
};
