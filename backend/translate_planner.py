# -*- coding: utf-8 -*-
"""Uyarlanabilir çeviri planlayıcısı (kuyruk-50 madde 4).

Parça büyüklüğü ve eşzamanlılığı iş İÇİNDEKİ ölçümlere göre ayarlar:
- gecikme (istek başına yanıt süresi, EMA)
- token sınırı (finish_reason=length gözlemlerinden öğrenilen güvenli tavan)
- hata oranı (kayan pencerede geçersiz/kesik/hata sonuçları)

Kararlar deterministik kurallarla verilir; saat/latency enjeksiyonla test
edilebilir (record/note_latency doğrudan çağrılabilir). Modülün bağımlılığı
yoktur — llm_translate tarafında yalnız bu sınıf kullanılır.
"""

OK = 'ok'
INVALID = 'invalid'
TRUNCATED = 'truncated'
ERROR = 'error'


class AdaptivePlanner:
    """Kayan pencere istatistiği + parça/eşzamanlılık kararı.

    Kurallar (deterministik, sıralı):
      - hata oranı >= ERR_SHRINK veya kesinti: parça yarıya (min_chunk),
        eşzamanlılık yarıya (>=1) — hata izolasyonu + sağlayıcı baskısını azalt.
      - hata oranı >= ERR_GROWTH veya yüksek gecikme (SLOW_LATENCY): büyüme
        yok, eşzamanlılık base-1'e kısılır — sağlayıcı doygun.
      - OK_STREAK ardışık temiz sonuç ve düşük hata oranı: parça x1.25+1
        (max_chunk'a kadar) — daha az istek = daha hızlı ve ucuz;
        eşzamanlılık base_workers'a geri döner (kullanıcı tavanı aşılmaz).
      - Kesinti (finish_reason=length): o parçanın est token'ının 0.8'i
        güvenli tavan (token_ceiling) olarak öğrenilir; sonraki paketler
        bu tavanla paketlenir — aynı kesinti tekrar ücret yakmaz.
    """

    WINDOW = 10          # hata oranı hesabında kullanılan son istek sayısı
    OK_STREAK = 8        # büyüme için gereken ardışık temiz sonuç
    ERR_GROWTH = 0.15    # bu oran ve üstü hata: büyüme yok + eşzamanlılık -1
    ERR_SHRINK = 0.30    # bu oran ve üstü hata: parça + eşzamanlılık yarıya
    SLOW_LATENCY = 45.0  # saniye — bu ortalama gecikme 'doygun sağlayıcı' sayılır
    CEILING_FACTOR = 0.8 # kesinti gözlenen est'in bu katı güvenli tavan

    def __init__(self, base_workers=3, base_chunk=20, min_chunk=4,
                 max_chunk=40, token_budget=0):
        self.base_workers = max(1, int(base_workers))
        self.min_chunk = max(1, int(min_chunk))
        self.max_chunk = max(self.min_chunk, int(max_chunk))
        self.chunk_size = min(self.max_chunk,
                              max(self.min_chunk, int(base_chunk)))
        self.workers = self.base_workers
        # token_budget>0: paketleme için başlangıç est tavanı; 0 = öğrenilene
        # kadar yalnız grup sayısı sınırlar.
        self.token_budget = int(token_budget or 0)
        self.token_ceiling = 0
        self._window = []
        self._ok_streak = 0
        self._latency_ema = None
        self.truncations = 0
        self.stats = {
            'requests': 0, 'invalid': 0, 'truncated': 0, 'errors': 0,
            'est_tokens_sent': 0, 'chunk_history': [], 'worker_history': [],
        }

    # ---- ölçüm ------------------------------------------------------------

    def note_latency(self, seconds):
        """İstek gecikmesi (saniye) — yalnız EMA besler."""
        try:
            lat = max(0.0, float(seconds))
        except (TypeError, ValueError):
            return
        self._latency_ema = lat if self._latency_ema is None else (
            0.7 * self._latency_ema + 0.3 * lat)

    @property
    def latency_ema(self):
        return self._latency_ema

    @property
    def error_rate(self):
        if not self._window:
            return 0.0
        bad = sum(1 for o in self._window if o != OK)
        return bad / len(self._window)

    def record(self, outcome, est_tokens=0):
        """Bir toplu istek sonucunu işle ve yeniden planla."""
        self.stats['requests'] += 1
        self.stats['est_tokens_sent'] += int(est_tokens or 0)
        self._window.append(outcome)
        if len(self._window) > self.WINDOW:
            self._window.pop(0)
        if outcome == OK:
            self._ok_streak += 1
        else:
            self._ok_streak = 0
        if outcome == INVALID:
            self.stats['invalid'] += 1
        elif outcome == ERROR:
            self.stats['errors'] += 1
        elif outcome == TRUNCATED:
            self.stats['truncated'] += 1
            self.truncations += 1
            if est_tokens:
                learned = max(1, int(est_tokens * self.CEILING_FACTOR))
                self.token_ceiling = (min(self.token_ceiling, learned)
                                      if self.token_ceiling else learned)
        self._replan()

    def _replan(self):
        rate = self.error_rate
        slow = (self._latency_ema is not None
                and self._latency_ema >= self.SLOW_LATENCY)
        last = self._window[-1] if self._window else None
        if rate >= self.ERR_SHRINK or last == TRUNCATED:
            self.chunk_size = max(self.min_chunk, self.chunk_size // 2)
            self.workers = max(1, self.base_workers // 2)
        elif rate >= self.ERR_GROWTH or slow:
            self.workers = max(1, min(self.workers, self.base_workers - 1))
        elif self._ok_streak >= self.OK_STREAK:
            self.chunk_size = min(self.max_chunk,
                                  int(self.chunk_size * 1.25) + 1)
            self.workers = self.base_workers
        self.stats['chunk_history'].append(self.chunk_size)
        self.stats['worker_history'].append(self.workers)
        for key in ('chunk_history', 'worker_history'):
            del self.stats[key][:-1000]

    # ---- paketleme ---------------------------------------------------------

    def pack_groups(self, groups, pos, size_of):
        """groups[pos:] üzerinden (düz indeks parçası, yeni pos) üret.

        Cümle grubu hiçbir zaman bölünmez: bütçeyi aşan tek grup yine de
        parçaya tek başına konur. `size_of(group)` -> est token döndürmeli.
        """
        limit = self.chunk_size
        caps = [cap for cap in (self.token_ceiling, self.token_budget) if cap > 0]
        cap = min(caps) if caps else 0
        chunk, cost, i = [], 0, pos
        while i < len(groups):
            group = groups[i]
            if chunk and group[0] != chunk[-1] + 1:
                break  # cümle köprüsü: bitişik olmayan grup yeni parça başlatır
            gcost = int(size_of(group) or 0)
            if chunk and (len(chunk) + len(group) > limit
                          or (cap and cost + gcost > cap)):
                break
            chunk.extend(group)
            cost += gcost
            i += 1
        return chunk, i
