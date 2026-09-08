const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sourcePath = path.join(__dirname, '..', 'src', 'watch-library-view.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const needle = 'let end = Math.min(safeTotal, Math.ceil((safeTop + safeViewport) / extent) + overscan);';
assert(source.includes(needle), 'mutation hedefi değişti');
const mutated = source.replace(needle, 'let end = safeTotal;');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-library-mutant-'));
const mutantPath = path.join(dir, 'watch-library-view.js');
fs.writeFileSync(mutantPath, mutated, 'utf8');

let rejected = false;
try {
  const mutant = require(mutantPath);
  const range = mutant.virtualRange({ total: 10000, scrollTop: 0, viewportHeight: 720,
    rowHeight: mutant.NORMAL_ROW_HEIGHT });
  assert(range.end - range.start <= 22, `mutant ${range.end - range.start} satır üretti`);
} catch (_) {
  rejected = true;
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

assert(rejected, 'tam-DOM mutationı regression kapısından geçti');
console.log('watch-library-mutation: 1 geçti, 0 başarısız');

