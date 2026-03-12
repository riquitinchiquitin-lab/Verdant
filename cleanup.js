
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * VERDANT SYSTEM MAINTENANCE: DIRECTORY PURGE PROTOCOL (ESM VERSION)
 * Target: All files and folders in current directory
 * Exclusion: .env, cleanup.js
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetDir = __dirname;
const exclude = ['.env', 'cleanup.js']; 

async function purge() {
  console.log('--- INITIATING DIRECTORY PURGE PROTOCOL ---');
  console.log(`Target Directory: ${targetDir}`);
  
  try {
    const items = fs.readdirSync(targetDir);

    for (const item of items) {
      if (exclude.includes(item)) {
        console.log(`[PRESERVED] ${item}`);
        continue;
      }

      const fullPath = path.join(targetDir, item);
      const stats = fs.statSync(fullPath);

      try {
        if (stats.isDirectory()) {
          fs.rmSync(fullPath, { recursive: true, force: true });
          console.log(`[DELETED DIR] ${item}`);
        } else {
          fs.unlinkSync(fullPath);
          console.log(`[DELETED FILE] ${item}`);
        }
      } catch (itemErr) {
        console.warn(`[SKIP] Could not delete ${item}: ${itemErr.message}`);
      }
    }

    console.log('--- PURGE COMPLETE. ONLY CONFIGURATION REMAINS. ---');
  } catch (err) {
    console.error(`[PROTOCOL FAULT] ${err.message}`);
  }
}

purge();
