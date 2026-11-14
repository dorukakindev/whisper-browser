'use strict';
const audit = "return " + require('./audit-snippet');
module.exports = [420, 520, 640, 820].flatMap((w) => [
  { name: 'header-' + w, size: [w, 800], code: "await MediaHomeUI.navigate('radio');return 1", wait: 1500, shot: 'h-' + w },
  { name: 'geom-' + w, code: "const q=s=>[...document.querySelectorAll(s)].filter(e=>e.getClientRects().length).map(e=>({c:(e.id||e.className.toString().split(' ').slice(0,3).join('.')),l:Math.round(e.getBoundingClientRect().left),r:Math.round(e.getBoundingClientRect().right),w:Math.round(e.getBoundingClientRect().width)}));return {vw:innerWidth,header:q('.mh-header, header.mh-top, .mh-bar').slice(0,3),actions:q('.mh-actions > *'),nav:q('.mh-nav > *')}", label: 'geom-' + w },
  { name: 'audit-' + w, code: audit, label: 'audit-' + w },
]);
