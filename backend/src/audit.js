const { v4: uuid } = require('uuid');
const db = require('./db');

function writeAudit({
  actorUserId = null,
  actorRole = null,
  actorKind = 'staff',
  deviceId = null,
  entityType,
  entityId,
  action,
  payload = {},
}) {
  const id = uuid();
  const occurredAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO audit_events
      (id, occurred_at, actor_user_id, actor_role, actor_kind, device_id, entity_type, entity_id, action, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    occurredAt,
    actorUserId,
    actorRole,
    actorKind,
    deviceId,
    entityType,
    entityId,
    action,
    JSON.stringify(payload)
  );
  return { id, occurredAt };
}

function listAuditForEntity(entityType, entityId) {
  return db.prepare(`
    SELECT * FROM audit_events
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY occurred_at ASC
  `).all(entityType, entityId).map((row) => ({
    ...row,
    payload: JSON.parse(row.payload || '{}'),
  }));
}

module.exports = { writeAudit, listAuditForEntity };
