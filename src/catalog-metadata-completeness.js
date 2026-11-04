'use strict';
const fs = require('node:fs');
// The scheduler and completion consumer must agree about every required field.
function metadataComplete(item) {
  return !!item && !!item.posterPath && fs.existsSync(item.posterPath)
    && !!item.originalLanguage && Array.isArray(item.productionCountries) && item.productionCountries.length>0 && Array.isArray(item.directorIds)
    && !!item.synopsis && !!item.genres?.length && !!item.directors?.length && !!item.runtime;
}
module.exports = { metadataComplete };
