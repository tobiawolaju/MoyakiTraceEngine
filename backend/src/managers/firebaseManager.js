import { config } from '../config/index.js';

export class FirebaseManager {
  constructor() {
    this.maxAgeMs = Number(process.env.MEMORY_FEED_WINDOW_MS || 15_000);
    this.blocks = [];
  }

  async initFirebase() {
    return true;
  }

  async verifyDatabaseConnection() {
    return true;
  }

  async writeBlockBundle(block) {
    this.blocks.push({
      blockHeight: block.blockHeight,
      hash: block.hash,
      parentHash: block.parentHash,
      timestamp: block.timestamp,
      nodeId: block.nodeId,
      status: block.status,
      transactions: []
    });

    while (this.blocks.length > config.maxInMemoryBlocks) {
      this.blocks.shift();
    }

    this.#trimByAge();
  }

  async rollbackBlocks(fromHeight, toHeight) {
    this.blocks = this.blocks.filter((block) => block.blockHeight < fromHeight || block.blockHeight > toHeight);
  }

  async cleanupOldData(maxAgeMs = this.maxAgeMs) {
    this.#trimByAge(maxAgeMs);
  }

  async loadHistoricalBlocks({ beforeTs, limit = 200 }) {
    this.#trimByAge();

    return this.blocks
      .filter((block) => block.timestamp < beforeTs)
      .slice(-limit)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  #trimByAge(maxAgeMs = this.maxAgeMs) {
    const cutoffTs = Date.now() - maxAgeMs;
    this.blocks = this.blocks.filter((block) => block.timestamp >= cutoffTs);
  }
}
