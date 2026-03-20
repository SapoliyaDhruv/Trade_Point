const AdminAuditLog = require('../models/AdminAuditLog');

const cleanString = (value, max = 300) => String(value || '').trim().slice(0, max);

const safeObject = (value) => {
  if (!value || typeof value !== 'object') return value ?? null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_err) {
    return null;
  }
};

const getRequestIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
};

exports.logAdminAudit = async (req, payload = {}) => {
  try {
    const adminId = req?.user?.id;
    const action = cleanString(payload.action, 120);
    if (!adminId || !action) return;

    await AdminAuditLog.create({
      adminId,
      action,
      entityType: cleanString(payload.entityType, 80),
      entityId: cleanString(payload.entityId, 120),
      summary: cleanString(payload.summary, 500),
      before: safeObject(payload.before),
      after: safeObject(payload.after),
      metadata: safeObject(payload.metadata) || {},
      ipAddress: cleanString(getRequestIp(req), 120),
      userAgent: cleanString(req.headers['user-agent'], 300)
    });
  } catch (err) {
    console.error('Admin audit log write failed:', err.message);
  }
};
