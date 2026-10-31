'use strict';
const fs = require('node:fs');
// The scheduler and completion consumer must agree about every required field.
function metadataComplete(item) {
  return !!item && !!item.posterPath && fs.existsSync(item.posterPath)
    && !!item.synopsis && !!item.genres?.length && !!item.directors?.length && !!item.runtime;
}
module.exports = { metadataComplete };
