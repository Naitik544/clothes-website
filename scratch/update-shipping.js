const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('little_to_large.db');

db.serialize(() => {
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('shipping_fee', '1')", (err) => {
    if (err) console.error('Error updating shipping_fee:', err.message);
    else console.log('Successfully updated shipping_fee to 1 in local SQLite');
  });
  
  db.all("SELECT * FROM settings", (err, rows) => {
    if (err) console.error('Error reading settings:', err.message);
    else console.log('Current settings in DB:', rows);
    db.close();
  });
});
