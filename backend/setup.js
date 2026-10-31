import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import dotenv from 'dotenv';
import { prepareLocalConfig } from './config/localSetup.js';

const file = new URL('./.env', import.meta.url);
const template = readFileSync(new URL('./.env.example', import.meta.url), 'utf8');
const prepared = prepareLocalConfig(template, existsSync(file) ? readFileSync(file, 'utf8') : '');
writeFileSync(file, prepared.content, { mode: 0o600 });
dotenv.config({ path: file, override: true });
console.log('Local configuration is ready. Initial admin credentials are in backend/.env. Existing accounts keep their current password.');
await import('./seed.js');
