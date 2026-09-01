'use strict';

function timeoutError(message) {
  const error = new Error(message || 'İşlem zaman aşımına uğradı.');
  error.code = 'ETIMEDOUT';
  return error;
}

function withTimeout(task, timeoutMs, message) {
  const ms = Math.max(1, Number(timeoutMs) || 1);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => finish(reject, timeoutError(message)), ms);
    Promise.resolve().then(() => typeof task === 'function' ? task() : task)
      .then((value) => finish(resolve, value), (error) => finish(reject, error));
  });
}

function withAbortTimeout(task, timeoutMs, message) {
  const controller = new AbortController();
  const ms = Math.max(1, Number(timeoutMs) || 1);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish(reject, timeoutError(message));
    }, ms);
    Promise.resolve().then(() => task(controller.signal))
      .then((value) => finish(resolve, value), (error) => finish(reject, error));
  });
}

module.exports = { withAbortTimeout, withTimeout };
