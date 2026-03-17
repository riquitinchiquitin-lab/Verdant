import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./data/verdant.db', (err) => {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }
  
  db.all('SELECT * FROM vault_key', [], (err, rows) => {
    if (err) console.error(err);
    else console.log('Vault Keys:', rows);
    
    db.get('SELECT COUNT(*) as count FROM plants', [], (err, row) => {
      if (err) console.error(err);
      else console.log('Plants Count:', row ? (row as any).count : 0);
      
      db.all('SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 10', [], (err, rows) => {
        if (err) console.error(err);
        else console.log('Recent Logs:', rows);
        db.close();
      });
    });
  });
});
