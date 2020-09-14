const fs = require('fs');

function json(path) { return JSON.parse(fs.readFileSync(path)); }

module.exports = {
  config: json('./data/config.json'),
  languages: json('./data/languages.json'),
  roles: json('./data/roles.json')
};
