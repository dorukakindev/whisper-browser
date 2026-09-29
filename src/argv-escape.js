'use strict';

// argparse, `--opt` sonrası `-` ile başlayan değeri yeni bir seçenek sanıp
// "expected one argument" ile süreci durdurur — fail-closed olduğu için
// kaçış riski yoktur ama `-foo.mp4` gibi meşru değerler de reddedilir.
// `--opt=değer` biçimi değeri tek argv öğesi olarak bağlar; hem kaçış hem
// kullanılabilirlik sorunu kapanır.
function pushBoundOption(argv, name, value) {
  const v = String(value);
  if (v.startsWith('-')) argv.push(`${name}=${v}`);
  else argv.push(name, v);
}

// Denetim: üretilmiş argv'de bilinen bir seçenek adından hemen sonra
// seçenek-benzeri değer geliyorsa (iki-parça itiminde kaçmamış) raporlar.
// Kaçan değerler `--ad=değer` tek öğesidir; taramada parçalanmaz.
function argvHasUnboundOptionValue(argv, optionNames) {
  const names = new Set(optionNames);
  for (let i = 1; i < argv.length; i++) {
    const token = String(argv[i]);
    if (!names.has(argv[i - 1])) continue;
    if (token.startsWith('-')) return { index: i, option: argv[i - 1], value: token };
  }
  return null;
}

module.exports = { argvHasUnboundOptionValue, pushBoundOption };
