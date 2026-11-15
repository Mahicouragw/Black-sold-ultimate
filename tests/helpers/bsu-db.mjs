// In-process PostgreSQL (PGlite) loaded with the real bsu_ schema and rules,
// so server tests run the exact SQL that is deployed.
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { Chess } from 'chess.js';
import { createHandler } from '../../server/bsu-handler.mjs';

export async function loadChessAI() {
    const source = await readFile(new URL('../../chess-ai-v755.js', import.meta.url), 'utf8');
    return import('data:text/javascript;charset=utf-8,' + encodeURIComponent(source));
}

export async function createServer() {
    const pg = new PGlite();
    for (const file of ['bsu_001_schema.sql', 'bsu_002_functions.sql']) {
        await pg.exec(await readFile(new URL(`../../server/sql/${file}`, import.meta.url), 'utf8'));
    }
    const db = async (uid, action, args) => (await pg.query('select public.bsu_api($1, $2, $3::jsonb) as r', [uid, action, JSON.stringify(args || {})])).rows[0].r;
    const ai = await loadChessAI();
    const handle = createHandler({ db, Chess, chooseMove: ai.chooseMove, describeMove: ai.describeMove, limit: 100000 });
    const sql = async (text, params = []) => (await pg.query(text, params)).rows;
    return { pg, db, handle, sql, Chess, ai, close: () => pg.close() };
}
