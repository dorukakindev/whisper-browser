const assert = require('assert');
const { createTerminologyMap, learnTerminology, terminologyPrompt } = require('../src/browser-terminology');

(() => {
  const map = createTerminologyMap({ maxTerms: 2, maxChars: 80 });
  assert.equal(learnTerminology(map, 'Captain Mira', 'Kaptan Mira', '1', 1), 0);
  assert.equal(learnTerminology(map, 'Captain Mira', 'Kaptan Mira', '2', 1), 1);
  assert.match(terminologyPrompt(map), /Captain Mira/);
  assert.deepEqual(map.terms.get('captain mira').cueIds, ['1', '2']);

  const disabled = createTerminologyMap();
  assert.equal(terminologyPrompt(disabled), '');
  assert.equal(learnTerminology(disabled, 'Captain', 'Kaptan', '1', 0.5), 0);
  assert.equal(terminologyPrompt(disabled), '');

  const bounded = createTerminologyMap({ maxTerms: 1 });
  learnTerminology(bounded, 'Doctor Who', 'Doktor Kim', '1');
  learnTerminology(bounded, 'Doctor Who', 'Doktor Kim', '2');
  learnTerminology(bounded, 'Professor X', 'Profesör X', '3');
  learnTerminology(bounded, 'Professor X', 'Profesör X', '4');
  assert.equal(bounded.terms.size, 1);
  console.log('  PASS terminology map');
})();
