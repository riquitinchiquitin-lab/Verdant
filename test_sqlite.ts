import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'test.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('SQLite Connection Error:', err.message);
    process.exit(1);
  }
  console.log('SQLite Connected Successfully');
  db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, val TEXT)');
    db.run('INSERT INTO test (val) VALUES (?)', ['hello']);
    db.all('SELECT * FROM test', (err, rows) => {
      if (err) {
        console.error('SQLite Query Error:', err.message);
        process.exit(1);
      }
      console.log('SQLite Query Result:', rows);
      process.exit(0);
    });
  });
});
