# R185 — innerHTML XSS lavaboları + localStorage kota + TODO/FIXME süpürmesi

Dal: `codex/r185-xss-todo-1790555000` (master `9a06178` üzerinden) — kod commit `f1be1cf`.

## Doğrulanmış düzeltme (1)

| Bulgu | Dosya | Düzeltme |
|---|---|---|
| `writeSourceEdits` üründeki TEK try-siz `localStorage.setItem` — kota aşımında (`QuotaExceededError`) kaynak-düzeltme kaydı sessiz kayıp + kayıt akışı yarıda kesiliyordu | `src/renderer/renderer.js` | `try/catch` eklendi; diğer 38 `setItem` sitesiyle aynı kalıp. Bilinen borç: kayıtlar scope başına 1000'le sınırlı, ancak silinmiş medyaya ait eski scope'ların kayıtları hiç budanmıyor — uzun vadede kota basınca artık sessiz-fail (davranış değişikliği olmadan). |

## Süpürme kanıtları — temiz

| Desen | Kapsam | Sonuç |
|---|---|---|
| `innerHTML`/`insertAdjacentHTML` dinamik interpolasyon | src/renderer/ 32 site | Tüm dinamik alanlar `escapeHtml()` ile sarılı (kuyruk listesi, cue listesi, geçmiş/bölüm panelleri); statik literaller ve sayısal alanlar güvenli; 24044'ta "uzak hata metni innerHTML'e girmez" sabit yorumu yerinde |
| `localStorage.setItem` | renderer 39 site | 38'i try'li; 1'i düzeltildi (yukarıda) |
| `JSON.parse(localStorage…)` | renderer 20 site | Tamamı try içinde |
| `parseInt` radix | src/ — 2 aday | İkisi de açık radix'li |
| `Promise.all`/`Promise.allSettled`/`.map(async` | src/ — 20/4/8 site | Sınırlı listeler; kontrollü eşzamanlılık |
| TODO/FIXME/HACK/XXX | src/ + backend/ | Ürün kodunda sıfır (venv/vendor dışı) |
| Kuyruk `data-id`/`data-open` interpolasyonu | renderer.js ~593 | `id = ++_queueIdCounter` — sayısal, attribute-kaçışı gerekmiyor |

## Test

`player-ui.test.js` 153/153 yeşil; `node --check` temiz.

## Windows etkisi

Yok — try/catch davranışı platformdan bağımsız; localStorage kotası Windows'ta aynı.
