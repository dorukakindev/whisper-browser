'use strict';
// Process details and URLs are never part of these authored user messages.
const messages=Object.freeze({
 caption_unavailable:[
  'The selected caption language and type are unavailable. Choose another caption; Whisper was not started automatically.',
  'Seçilen dilde ve türde altyazı bulunamadı. Başka bir altyazı seçin; Whisper otomatik başlatılmadı.'],
 caption_conversion_failed:[
  'Captions could not be converted to SRT. Check FFmpeg and try again.',
  'Altyazı SRT biçimine dönüştürülemedi. FFmpeg kurulumunu kontrol edip yeniden deneyin.'],
 caption_invalid_result:[
  'No valid caption file was received. Try again or choose another caption.',
  'Geçerli altyazı dosyası alınamadı. Yeniden deneyin veya başka bir altyazı seçin.']
});
module.exports=(code,locale)=>Object.hasOwn(messages,code)?messages[code][locale==='tr'?1:0]:'';
