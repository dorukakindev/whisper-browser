'use strict';
// Synthetic podcast library for visual/interaction checks. No personal data.
const path = require('node:path');
const SHOWS = [
  { slug: 'gece', title: 'Gece Yayını', author: 'Deniz Arda', c1: '#e9a84a', c2: '#7a3b12', blurb: 'Sinema, ses ve şehir üzerine uzun, sakin gece sohbetleri.', eps: ['Sessizliğin sineması', 'Bir sahne nasıl kesilir?', 'Yağmurun sesi, ekranın ışığı', 'Uzun planın sabrı', 'Yönetmen koltuğunda bir saat', 'Karanlık salon, ortak nefes', 'Müzik girmeden önce', 'Kırk yıllık bir afiş', 'Altyazının görünmez emeği', 'Son perde: kapanış konuşması'] },
  { slug: 'atolye', title: 'Ses Atölyesi', author: 'Mert & Ece', c1: '#4fb6a8', c2: '#0f3d46', blurb: 'Yapay zekâ, ses ve yazılım üzerine haftalık atölye notları.', eps: ['Whisper ile dört saatlik kayıt', 'Konuşmacı ayırma nasıl çalışır?', 'Çeviride bağlam neden önemli', 'Yerel model, uzak model', 'Dublajda doğal tonlama', 'Transkript arama: ilk prototip', 'GPU belleği ve gerçekler', 'Altyazı senkronu üzerine', 'Açık kaynak ses araçları', 'Kullanıcı geri bildirimi'] },
  { slug: 'okuma', title: 'Uzun Okuma', author: 'Selin Aksoy', c1: '#9b8cff', c2: '#2a1f5c', blurb: 'Roman, deneme ve çeviri: bir kitabın içinde yavaş yürüyüşler.', eps: ['Kıyıdaki kitap kulübü', 'Çevirmenin görünmeyen eli', 'Roman mı, hatıra mı?', 'Dipnotların büyüsü', 'İlk cümleler', 'Raflar arasında bir gün', 'Okumak ve unutmak'] },
  { slug: 'anime', title: 'Haftanın Anime Günlüğü', author: 'Kaan Yılmaz', c1: '#ff7a90', c2: '#5a1030', blurb: 'Her hafta bir seri: yayın notları, müzikler ve sezon özeti.', eps: ['Sezon açılışı: neler izlenir?', 'Müzik ve ritim', 'Manga mı, anime mi?', 'Stüdyo portresi', 'Klasiklere dönüş', 'Kış sezonu özeti'] },
];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function rss(show, index) {
  const art = `https://cdn.pod.example/art/${show.slug}.svg`;
  const items = show.eps.map((title, i) => {
    const day = new Date(Date.UTC(2026, 10, 12 - i * (index + 2) - index, 7, 0, 0)).toUTCString();
    const mins = 22 + ((i * 7 + index * 13) % 58);
    return `<item><title>Bölüm ${show.eps.length - i}: ${esc(title)}</title><guid>${show.slug}-${i}</guid><pubDate>${day}</pubDate><description>&lt;p&gt;${esc(title)} üzerine konuşuyoruz. Bu bölümde &lt;b&gt;konuk&lt;/b&gt; ve kısa notlar var.&lt;/p&gt;</description><itunes:duration>00:${String(mins).padStart(2, '0')}:10</itunes:duration><itunes:image href="${art}"/><enclosure url="https://cdn.pod.example/a/${show.slug}-${i}.mp3" type="audio/mpeg" length="${mins * 700000}"/></item>`;
  }).join('');
  return `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>${esc(show.title)}</title><link>https://pod.example/${show.slug}</link><description>${esc(show.blurb)}</description><itunes:author>${esc(show.author)}</itunes:author><itunes:image href="${art}"/>${items}</channel></rss>`;
}
module.exports = function seed({ root, profile }) {
  const { createFeedStore } = require(path.join(root, 'src/feed-store'));
  const P = require(path.join(root, 'src/feed-parser'));
  const store = createFeedStore(path.join(profile, 'feeds.json'));
  SHOWS.forEach((show, index) => {
    const parsed = P.parseFeed(rss(show, index), `https://pod.example/${show.slug}.xml`);
    store.subscribe({ url: `https://pod.example/${show.slug}.xml`, title: show.title, description: parsed.description, imageUrl: parsed.imageUrl, author: parsed.author, format: parsed.format }, parsed.entries, 'all');
  });
};
module.exports.SHOWS = SHOWS;
