const assert = require('assert');
const { createTerminologyMap, learnTerminology, seedTerminology, terminologyPrompt,
  terminologySuggestions } = require('../src/browser-terminology');

(() => {
  const map = createTerminologyMap({ maxTerms: 2, maxChars: 80 });
  assert.equal(learnTerminology(map, 'Captain Mira', 'Kaptan Mira', '1', 1), 0);
  assert.equal(learnTerminology(map, 'Captain Mira', 'Kaptan Mira', '2', 1), 1);
  assert.match(terminologyPrompt(map), /Captain Mira/);
  assert.deepEqual(map.terms.get('captain mira').cueIds, ['1', '2']);
  assert.deepEqual(terminologySuggestions(map), [{ source: 'Captain Mira', target: 'Kaptan Mira', count: 2 }]);
  assert.deepEqual(terminologySuggestions(map, ['Captain Mira=Kaptan Mira']), []);

  const inferred = createTerminologyMap();
  learnTerminology(inferred, 'The cat sat by Winterfell.', 'Kedi Kışyarı yanında oturdu.', '1');
  learnTerminology(inferred, 'The dog left Winterfell.', 'Köpek Kışyarı’dan ayrıldı.', '2');
  assert.equal(inferred.terms.has('the'), false, 'cümle başındaki The terim olarak öğrenildi');
  assert.equal(inferred.terms.get('winterfell').target, '',
    'tek kaynak terimine bütün cümlenin çevirisi yanlış eşlendi');
  assert.match(terminologyPrompt(inferred), /(?:^| \| )Winterfell(?: \||$)/);
  assert.doesNotMatch(terminologyPrompt(inferred), /Winterfell=/);

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

  const seeded = createTerminologyMap({ minOccurrences: 2 });
  assert.equal(seedTerminology(seeded, [
    'Winterfell is quiet.', 'We returned to Winterfell.', 'A generic sentence.',
  ]), 1);
  assert.match(terminologyPrompt(seeded), /Winterfell/);
  assert.equal(seeded.terms.get('winterfell').target, '');
  const generic = createTerminologyMap({ minOccurrences: 2 });
  seedTerminology(generic, ['Welcome back.', 'Welcome home.']);
  assert.equal(terminologyPrompt(generic), '');
  console.log('  PASS terminology map');
})();
