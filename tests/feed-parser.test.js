'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../src/feed-parser');
test('episode schema follows the observed enclosure and keeps episode and show artwork separate',()=>{
 const episode=(id)=>({'@type':'PodcastEpisode',name:'Episode '+id,image:'/episode-'+id+'.jpg',
  associatedMedia:{'@type':'AudioObject',contentUrl:'/audio-'+id+'.mp3'},
  partOfSeries:{name:'The program',image:'/show.jpg',publisher:{name:'The publisher'}}});
 const html='<script type="application/ld+json">'+JSON.stringify([episode(1),episode(2)])+'</script>';
 const page='https://feed.example/episodes';
 assert.equal(P.discoverPodcastEpisode(html,page),null);
 const matched=P.discoverPodcastEpisode(html,page,'https://feed.example/audio-2.mp3');
 assert.equal(matched.episode.image,'https://feed.example/episode-2.jpg');
 assert.equal(matched.podcast.image,'https://feed.example/show.jpg');
 assert.equal(matched.podcast.publisher,'The publisher');
 assert.equal(P.discoverPodcastEpisode(html,page,'https://feed.example/promo.mp3'),null);
});
test('RSS, Atom and JSON Feed normalize safe text, native identity and enclosure types',()=>{
 const rss=P.parseFeed('<rss version="2.0"><channel><title>Sinema</title><language>tr</language><item><guid>native:1</guid><title>Öykü</title><link>/one</link><description><![CDATA[<p>Kaynağın özeti</p><script>bad()</script>]]></description><enclosure url="https://audio.example/one.mp3" type="audio/mpeg"/></item></channel></rss>','https://feed.example/rss');
 assert.equal(rss.entries[0].externalId,'native:1');assert.equal(rss.entries[0].kind,'podcast');assert.equal(rss.entries[0].url,'https://feed.example/one');assert.equal(rss.entries[0].contentScope,'summary');assert.doesNotMatch(rss.entries[0].text,/bad|script/);
 const atom=P.parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"><title>Videos</title><entry><id>tag:1</id><title>Video</title><link href="/watch"/><content type="html">Full &lt;b&gt;source&lt;/b&gt;</content><link rel="enclosure" type="video/mp4" href="/video.mp4"/></entry></feed>','https://feed.example/atom');assert.equal(atom.entries[0].kind,'video');assert.equal(atom.entries[0].contentScope,'feed-full');
 const json=P.parseFeed(JSON.stringify({version:'https://jsonfeed.org/version/1.1',title:'JSON',items:[{id:'opaque',url:'https://news.example/a',content_text:'Full source text.'}]}),'https://feed.example/json');assert.equal(json.entries[0].externalId,'opaque');assert.equal(json.entries[0].contentScope,'feed-full');
 const xhtml=P.parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>mixed</id><title>Mixed</title><content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml">Hello <b>bold</b> world.</div></content></entry></feed>','https://feed.example/atom');assert.equal(xhtml.entries[0].text,'Hello bold world.');
});
test('malformed XML, DOCTYPE, deep trees and oversized bodies are rejected',()=>{
 for(const text of ['<rss><channel></rss>','<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]><rss/>','<rss>'+ '<x>'.repeat(50)+'</x>'.repeat(50)+'</rss>','x'.repeat(2000001)])assert.throws(()=>P.parseFeed(text,'https://feed.example/rss'));
});
test('ordinary publisher HTML is identified without calling it unsafe or oversized XML',()=>{
 for(const html of ['<!DOCTYPE html><html><head><title>Episode</title></head></html>','<html lang="tr"><body>Episode</body></html>'])assert.throws(()=>P.parseFeed(html,'https://publisher.example/episode'),/HTML page, not an RSS/);
 assert.throws(()=>P.parseFeed('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]><rss/>','https://publisher.example/rss'),/Unsafe/);
});
test('autodiscovery and OPML are bounded previews, never scripts or private/signed URLs',()=>{
 const candidates=P.discoverFeeds('<link rel="alternate" type="application/rss+xml" title="Cinema" href="/rss"><link rel="alternate" type="application/atom+xml" href="http://127.0.0.1/private">','https://news.example/');assert.equal(candidates.length,1);assert.equal(candidates[0].url,'https://news.example/rss');
 const imported=P.parseOpml('<opml><body><outline text="Cinema"><outline text="Reviews" xmlUrl="https://news.example/rss"/><outline xmlUrl="file:///secret"/></outline></body></opml>');assert.equal(imported.rows[0].folder,'Cinema');assert.equal(imported.rejected,1);assert.equal(P.parseOpml(P.exportOpml(imported.rows)).rows.length,1);
 assert.equal(P.safeUrl('https://site.example/rss?token=secret'),'');
});
