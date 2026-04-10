import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3').verbose();
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'verdant.db');

if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new sqlite3.Database(dbPath);

const query = (sql: string, params: any[] = []): Promise<any> => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(this: any, err: Error | null) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
};

async function seed() {
    console.log('Seeding database...');

    const houseId = 'h-default-1';
    const house = {
        id: houseId,
        name: { en: 'Home Sanctuary', fr: 'Sanctuaire Familial' },
        createdAt: new Date().toISOString()
    };

    await query('INSERT OR REPLACE INTO houses (id, name, createdAt, data) VALUES (?, ?, ?, ?)', [
        house.id,
        JSON.stringify(house.name),
        house.createdAt,
        JSON.stringify(house)
    ]);

    const plants = [
        {
            id: 'p-monstera-1',
            houseId,
            species: 'Monstera Deliciosa',
            nickname: { en: 'Swiss Cheese', fr: 'Plante Fromage' },
            images: ['https://images.unsplash.com/photo-1614594975525-e45190c55d0b?auto=format&fit=crop&w=800&q=80'],
            logs: [],
            lastWatered: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            wateringInterval: 7,
            lightAdvice: { en: 'Bright indirect light', fr: 'Lumière vive indirecte' },
            nutritionAdvice: { en: 'Monthly during growing season', fr: 'Mensuel pendant la saison de croissance' }
        },
        {
            id: 'p-ficus-1',
            houseId,
            species: 'Ficus Lyrata',
            nickname: { en: 'Fiddle Leaf', fr: 'Figuier Lyre' },
            images: ['https://images.unsplash.com/photo-1597055181300-e3633a207519?auto=format&fit=crop&w=800&q=80'],
            logs: [],
            lastWatered: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            wateringInterval: 10,
            lightAdvice: { en: 'Bright filtered light', fr: 'Lumière vive filtrée' },
            nutritionAdvice: { en: 'Every 2 weeks in summer', fr: 'Toutes les 2 semaines en été' }
        },
        {
            id: 'p-snake-1',
            houseId,
            species: 'Sansevieria Trifasciata',
            nickname: { en: 'Immortality', fr: 'Immortalité' },
            images: ['https://images.unsplash.com/photo-1593482892290-f54927ae1bac?auto=format&fit=crop&w=800&q=80'],
            logs: [],
            lastWatered: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            wateringInterval: 21,
            lightAdvice: { en: 'Low to bright light', fr: 'Lumière faible à vive' },
            nutritionAdvice: { en: 'Rarely needed', fr: 'Rarement nécessaire' }
        }
    ];

    for (const p of plants) {
        await query('INSERT OR REPLACE INTO plants (id, houseId, species, nickname, images, logs, lastWatered, updatedAt, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            p.id,
            p.houseId,
            p.species,
            JSON.stringify(p.nickname),
            JSON.stringify(p.images),
            JSON.stringify(p.logs),
            p.lastWatered,
            p.updatedAt,
            JSON.stringify(p)
        ]);
    }

    const inventory = [
        {
            id: 'i-fert-1',
            houseId,
            name: { en: 'Organic Fertilizer', fr: 'Engrais Organique' },
            type: 'FERTILIZER',
            quantity: 500,
            unit: 'ml',
            minStock: 100
        },
        {
            id: 'i-neem-1',
            houseId,
            name: { en: 'Neem Oil', fr: 'Huile de Neem' },
            type: 'PEST_CONTROL',
            quantity: 200,
            unit: 'ml',
            minStock: 50
        }
    ];

    for (const i of inventory) {
        await query('INSERT OR REPLACE INTO inventory (id, houseId, name, data) VALUES (?, ?, ?, ?)', [
            i.id,
            i.houseId,
            JSON.stringify(i.name),
            JSON.stringify(i)
        ]);
    }

    const tasks = [
        {
            id: 't-water-monstera',
            houseId,
            plantIds: ['p-monstera-1'],
            type: 'WATER',
            title: { en: 'Water Swiss Cheese', fr: 'Arroser Plante Fromage' },
            description: { en: 'Check soil moisture first', fr: 'Vérifier l\'humidité du sol d\'abord' },
            date: new Date().toISOString(),
            completed: 0,
            recurrence: { type: 'DAILY' }
        }
    ];

    for (const t of tasks) {
        await query('INSERT OR REPLACE INTO tasks (id, houseId, plantIds, type, title, description, date, completed, completedAt, recurrence, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            t.id,
            t.houseId,
            JSON.stringify(t.plantIds),
            t.type,
            JSON.stringify(t.title),
            JSON.stringify(t.description),
            t.date,
            t.completed,
            null,
            JSON.stringify(t.recurrence),
            JSON.stringify(t)
        ]);
    }

    const usage = {
        id: `${new Date().getFullYear()}-${new Date().getMonth() + 1}`,
        gemini_count: 42,
        gemini_tokens: 15420,
        plantnet_count: 12,
        trefle_count: 8,
        perenual_count: 5,
        serper_count: 15,
        opb_count: 3,
        last_updated: new Date().toISOString()
    };

    await query(`INSERT OR REPLACE INTO api_usage (id, gemini_count, gemini_tokens, plantnet_count, trefle_count, perenual_count, serper_count, opb_count, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        usage.id, usage.gemini_count, usage.gemini_tokens, usage.plantnet_count, usage.trefle_count, usage.perenual_count, usage.serper_count, usage.opb_count, usage.last_updated
    ]);

    const logs = [
        { event: 'SYSTEM_BOOT', details: 'Verdant Botanical Protocol v1.0.0 initialized', level: 'INFO' },
        { event: 'SECURITY_HANDSHAKE', details: 'Vault key synchronized with environment', level: 'INFO' },
        { event: 'PLANT_IDENTIFIED', details: 'Monstera Deliciosa identified via Gemini Vision', level: 'INFO' }
    ];

    for (const l of logs) {
        await query('INSERT INTO system_logs (event, details, level, created_at) VALUES (?, ?, ?, ?)', [
            l.event, l.details, l.level, new Date().toISOString()
        ]);
    }

    console.log('Seeding complete.');
    db.close();
}

seed().catch(err => {
    console.error('Seeding failed:', err);
    process.exit(1);
});
