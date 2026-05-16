<script>
  import { parseOpcodes } from '../wasmTrace';
  export let block = null;
  export let onClose = () => {};

  const fmt = (value) => (value === null || value === undefined || value === '' ? 'N/A' : value);
  const fmtTimestamp = (value) => {
    const ts = Number(value);
    if (!Number.isFinite(ts)) return 'N/A';
    const date = new Date(ts);
    return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
  };
  const getOpcodeList = (opcodes) => {
    const parsed = parseOpcodes(opcodes);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'string') {
      return parsed
        .split(',')
        .map((opcode) => opcode.trim())
        .filter(Boolean);
    }
    return [];
  };
</script>

{#if block}
  <div class="overlay" role="button" tabindex="0" on:click={onClose} on:keydown={(e) => e.key === 'Escape' && onClose()}>
    <div class="modal" on:click|stopPropagation>
      <button class="close-btn" on:click={onClose} aria-label="Close modal">&times;</button>
      <div class="modal-head">
        <div>
          <p class="eyebrow">Execution detail</p>
          <h3>Block {fmt(block.blockHeight)}</h3>
        </div>
        <span class={`status-chip ${block.status === 'canonical' ? 'good' : block.status === 'pending' ? 'warn' : 'bad'}`}>
          {fmt(block.status)}
        </span>
      </div>

      <div class="meta-grid">
        <div>
          <strong>Node</strong>
          <span>{fmt(block.nodeId)}</span>
        </div>
        <div>
          <strong>Block Number</strong>
          <span>{fmt(block.blockHeight)}</span>
        </div>
        <div>
          <strong>Status</strong>
          <span>{fmt(block.status)}</span>
        </div>
        <div>
          <strong>Timestamp</strong>
          <span>{fmtTimestamp(block.timestamp)}</span>
        </div>
        <div class="full">
          <strong>Hash</strong>
          <span>{fmt(block.hash)}</span>
        </div>
        <div class="full">
          <strong>Parent Hash</strong>
          <span>{fmt(block.parentHash)}</span>
        </div>
        <div>
          <strong>Transactions</strong>
          <span>{block.transactions?.length || 0}</span>
        </div>
      </div>

      <h4>Transactions</h4>
      <div class="tx-list">
        {#if !block.transactions?.length}
          <div class="tx-empty">No transactions in this block.</div>
        {:else}
          {#each block.transactions as tx, index}
            {@const opcodeList = getOpcodeList(tx?.opcodes)}
            {@const parallelIndex = tx?.parallelIndex ?? index}
            {@const threadId = tx?.threadId ?? `thread-${parallelIndex}`}
            <div class="tx-card">
              <div class="tx-line"><strong>Tx Hash</strong><span>{fmt(tx?.txHash || tx?.hash)}</span></div>
              <div class="tx-line"><strong>Parallel Index</strong><span>{parallelIndex} ({threadId})</span></div>
              <div class="tx-line">
                <strong>Opcodes</strong>
                <span>{opcodeList.length ? opcodeList.slice(0, 16).join(', ') : 'Not indexed yet'}</span>
              </div>
              <div class="tx-line"><strong>Internal Calls</strong><span>{tx?.internalCalls?.length || 0}</span></div>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

