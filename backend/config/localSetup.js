import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';

export function prepareLocalConfig(template, existing = '') {
  const config = { ...dotenv.parse(template), ...dotenv.parse(existing) };
  let content = existing || template;
  const set = (key, value) => {
    const pattern = new RegExp('^' + key + '=.*$', 'm');
    content = pattern.test(content) ? content.replace(pattern, key + '=' + value) : content.trimEnd() + '\n' + key + '=' + value + '\n';
    config[key] = value;
  };
  for (const [key, value] of Object.entries(dotenv.parse(template))) {
    if (!(key in dotenv.parse(content))) set(key, value);
  }
  if (!config.MONGODB_URI) set('MONGODB_URI', 'mongodb://127.0.0.1:27017/subsight');
  if (!config.JWT_SECRET || config.JWT_SECRET.length < 32 || config.JWT_SECRET.startsWith('replace-with-')) set('JWT_SECRET', randomBytes(48).toString('hex'));
  if (!config.ADMIN_EMAIL) set('ADMIN_EMAIL', 'admin@subsight.local');
  if (!config.ADMIN_PASSWORD) set('ADMIN_PASSWORD', 'Aa!' + randomBytes(18).toString('base64url'));
  return { content, config };
}
