const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts.test = "jest";
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
