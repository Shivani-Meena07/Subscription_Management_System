import { AuditEvent } from './models.js';

const pendingWrites = new Set();

export function auditActivity(req, res, next) {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next();
  const json = res.json;
  res.json = function (body) {
    res.locals.auditRecordId = body?.item?._id || body?.user?.id;
    return json.call(this, body);
  };
  res.once('finish', () => {
    if (!req.user || res.statusCode >= 400) return;
    const segments = req.originalUrl.split('?')[0].split('/').filter(Boolean);
    const write = AuditEvent.create({
      actor: req.user._id, action: req.method + ' ' + req.originalUrl.split('?')[0],
      resource: segments[1] || 'api', recordId: segments[2] || res.locals.auditRecordId
    }).catch((error) => console.error('Activity log could not be saved:', error.message));
    pendingWrites.add(write);
    write.finally(() => pendingWrites.delete(write));
  });
  next();
}

export async function flushAudit() {
  await Promise.all([...pendingWrites]);
}
