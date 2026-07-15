const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(publicDir);

const target1 = '<link rel="icon" type="image/png" href="/images/logo-new.png?v=3">';
const target2 = '<link rel="shortcut icon" href="/images/logo-new.png?v=3">';

const replacement1 = '<link rel="icon" type="image/png" href="/favicon.png?v=4">';
const replacement2 = '<link rel="shortcut icon" href="/favicon.ico?v=4">';

files.forEach(file => {
  if (file.endsWith('.html')) {
    const filePath = path.join(publicDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    let updated = false;
    if (content.includes(target1)) {
      content = content.replace(target1, replacement1);
      updated = true;
    }
    if (content.includes(target2)) {
      content = content.replace(target2, replacement2);
      updated = true;
    }
    
    if (updated) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Successfully updated favicon tags in: ${file}`);
    }
  }
});
