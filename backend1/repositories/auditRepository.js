const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUDIT_FILE = path.join(__dirname, '../data/audit_ledger.json');

function ensureAuditFile() {
  const dir = path.dirname(AUDIT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(AUDIT_FILE)) {
    const genesisBlock = {
      index: 0,
      timestamp: new Date().toISOString(),
      action: 'CHAIN_INITIALIZED',
      actorId: 'SYSTEM',
      patientId: null,
      details: 'Kathir Memorial Hospital — Patient Intelligence Blockchain Audit Ledger initialized',
      previousHash: '0000000000000000',
      hash: crypto.createHash('sha256').update('genesis').digest('hex'),
    };
    fs.writeFileSync(AUDIT_FILE, JSON.stringify([genesisBlock], null, 2), 'utf8');
  }
}

class AuditRepository {
  constructor() {
    ensureAuditFile();
  }

  getChain() {
    try {
      ensureAuditFile();
      const raw = fs.readFileSync(AUDIT_FILE, 'utf8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  appendBlock(action, actorId, patientId, details) {
    const chain = this.getChain();
    const prevHash = chain.length > 0 ? chain[chain.length - 1].hash : '0000000000000000';

    const blockData = {
      index: chain.length,
      timestamp: new Date().toISOString(),
      action,
      actorId,
      patientId,
      details,
      previousHash: prevHash,
    };

    blockData.hash = crypto.createHash('sha256').update(JSON.stringify(blockData)).digest('hex');
    chain.push(blockData);

    try {
      fs.writeFileSync(AUDIT_FILE, JSON.stringify(chain, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to write audit block:', err.message);
    }

    return blockData;
  }

  verifyChain() {
    const chain = this.getChain();
    for (let i = 1; i < chain.length; i++) {
      const block = chain[i];
      const { hash, ...rest } = block;
      const recalculated = crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex');
      if (recalculated !== hash) return { valid: false, failedAt: i };
      if (block.previousHash !== chain[i - 1].hash) return { valid: false, failedAt: i };
    }
    return { valid: true, blocks: chain.length };
  }
}

module.exports = new AuditRepository();
