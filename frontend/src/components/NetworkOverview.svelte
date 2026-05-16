<script>
  export let overview = null;
  export let nodes = [];

  const nodeCount = () => nodes.length;
  const healthyCount = () => nodes.filter((node) => !node.isDisabled && !node.lastErrorAt).length;
  const laggingCount = () => nodes.filter((node) => Number(node.lagBlocks || 0) > 0).length;

  const fmtAgo = (ts) => {
    if (!ts) return 'N/A';
    const deltaSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (deltaSec < 60) return `${deltaSec}s ago`;
    if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`;
    return `${Math.floor(deltaSec / 3600)}h ago`;
  };
</script>

<section class="panel overview-panel">
  <div class="panel-header">
    <div>
      <p class="eyebrow">Network overview</p>
      <h2>Head stack</h2>
    </div>
    <div class="panel-subcopy">
      <span class={`status-chip ${overview?.headsAgree ? 'good' : 'warn'}`}>
        {overview?.headsAgree ? 'IN SYNC' : 'DIVERGED'}
      </span>
      <span class="status-chip muted">{nodeCount()} nodes</span>
    </div>
  </div>

  <div class="cards kpi-grid">
    <article class="kpi-card">
      <h3>Heads</h3>
      <p>{overview?.headsAgree ? 'Aligned' : 'Split'}</p>
      <span>{healthyCount()} healthy, {laggingCount()} lagging</span>
    </article>
    <article class="kpi-card">
      <h3>Highest Seen</h3>
      <p>{overview?.highestSeenBlock ?? 'N/A'}</p>
      <span>Latest observed head height</span>
    </article>
    <article class="kpi-card">
      <h3>Highest Indexed</h3>
      <p>{overview?.highestProcessedBlock ?? 'N/A'}</p>
      <span>Canonical index watermark</span>
    </article>
  </div>

  <div class="table-wrap terminal-table">
    <table>
      <thead>
        <tr>
          <th>Node</th>
          <th>Seen</th>
          <th>Indexed</th>
          <th>Lag</th>
          <th>Queue</th>
          <th>Last Indexed</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
          {#if !nodes.length}
          <tr>
            <td colspan="7" class="empty">No node telemetry yet</td>
          </tr>
        {:else}
          {#each nodes as node}
            <tr>
              <td class="node-cell">
                <strong>{node.nodeId}</strong>
                <span>{node.isDisabled ? 'disabled feed' : node.lastErrorAt ? 'degraded feed' : 'active feed'}</span>
              </td>
              <td>{node.latestSeenBlock ?? 'N/A'}</td>
              <td>{node.latestProcessedBlock ?? 'N/A'}</td>
              <td>{node.lagBlocks ?? 'N/A'}</td>
              <td>{node.queueDepth}{node.queuePaused ? ' (paused)' : ''}</td>
              <td>{fmtAgo(node.lastProcessedAt)}</td>
              <td>
                {#if node.isDisabled}
                  <span class="pill down">Disabled</span>
                {:else if node.lastErrorAt}
                  <span class="pill warn">Error</span>
                {:else}
                  <span class="pill ok">Healthy</span>
                {/if}
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</section>


