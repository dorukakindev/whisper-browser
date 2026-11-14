'use strict';
// Example: open the podcast page (needs DESIGN_FIXTURE=podcasts), open a show, take screenshots at three widths.
// A step is { size:[w,h], code:'js run in the renderer', wait:ms, shot:'name', counters:true, profile:true }
// or { seq:[ {click:'css selector'} (REAL mouse input), {key:'Escape'}, {code:'...', label:'...'}, {shot:'name'} ] }.
module.exports = [
  { name: 'podcast-1920', size: [1920, 1080], code: "await MediaHomeUI.navigate('radio');return 1", wait: 2200, shot: 'podcast-1920x1080' },
  { name: 'open-show', size: [1440, 900], seq: [{ click: '.pl-programs .pl-program:nth-child(3)', wait: 900, shot: 'podcast-show-1440' }] },
  { name: 'narrow', size: [820, 900], shot: 'podcast-show-820', wait: 600 },
  { name: 'minimum', size: [420, 800], shot: 'podcast-show-420', wait: 600 },
];
