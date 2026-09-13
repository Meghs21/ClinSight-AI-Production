const auditRepo = require('../repositories/auditRepository');

let io = null;

function ensureGenesis() {
  if (chain.length === 0) {
    chain.push({
      index: 0,
      timestamp: new Date().toISOString(),
      action: 'CHAIN_INITIALIZED',
      actorId: 'SYSTEM',
      patientId: null,
      details: 'Kathir Memorial Hospital — Patient Intelligence Blockchain Audit Ledger initialized',
      previousHash: '0000000000000000',
      hash: crypto.createHash('sha256').update('genesis').digest('hex')
    });
  }
}

function init(socketIo) {
  io = socketIo;
  auditRepo.getChain(); // Ensure persistent storage initialized
}

function addBlock(action, actorId, patientId, details) {
  const blockData = auditRepo.appendBlock(action, actorId, patientId, details);
  if (io) io.emit('new_block', blockData);
  return blockData;
}

function getChain() {
  return auditRepo.getChain();
}

function verifyChain() {
  return auditRepo.verifyChain();
}

function exportCSV() {
  const chain = auditRepo.getChain();
  const header = 'Index,Timestamp,Action,Actor,PatientID,Details,Hash\n';
  const rows = chain.map(b =>
    `${b.index},"${b.timestamp}","${b.action}","${b.actorId}","${b.patientId || ''}","${b.details}","${b.hash ? b.hash.substring(0, 16) : ''}..."`
  ).join('\n');
  return header + rows;
}

module.exports = { init, addBlock, getChain, verifyChain, exportCSV };
