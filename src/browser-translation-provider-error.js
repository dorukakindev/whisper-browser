'use strict';

function classifyTranslationHttpFailure(status, detail = '') {
  const code = Number(status) || 0;
  // A provider's routing failure for this model is not a temporary server
  // error. Repeating every sentence would only multiply requests and logs.
  const unavailableModel = code === 503
    && /(?:no available channel|no channel available)\b/i.test(String(detail || ''));
  return {
    retryable: !unavailableModel && ([408, 425, 429].includes(code) || code >= 500),
    providerUnavailable: unavailableModel,
  };
}

module.exports = { classifyTranslationHttpFailure };
