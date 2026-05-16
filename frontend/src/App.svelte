<script>
  import { onMount } from 'svelte';
  import ChainGrid from './components/ChainGrid.svelte';
  import BlockModal from './components/BlockModal.svelte';
  import NetworkOverview from './components/NetworkOverview.svelte';
  import SplashScreen from './components/SplashScreen.svelte';

  let blocks = [];
  let overview = null;
  let nodes = [];
  let selectedBlock = null;
  let highlightedHashes = [];
  let isPaused = false;
  let isFollowingLive = true;
  let historyLoading = false;
  let historyExhausted = false;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let highlightTimer = null;
  let syncTimer = null;
  let overviewTimer = null;
  let syncInFlight = false;
  let overviewInFlight = false;
  let ws = null;
  let shouldReconnect = true;
  let showSplash = true;
  let activeSection = 'hero';
  let sectionObserver = null;

  const localApiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
  const localWsBase = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8080';
  const fallbackApiBase = 'https://moyakitraceengine.onrender.com';
  const fallbackWsBase = 'wss://moyakitraceengine.onrender.com';
  const wsPath = import.meta.env.VITE_WS_PATH || '/ws';
  const liveWindowMs = Math.max(
    30_000,
    Number(import.meta.env.VITE_VISIBLE_WINDOW_MS || 2 * 60 * 1000)
  );
  const maxRetainedBlocks = Math.max(
    500,
    Number(import.meta.env.VITE_MAX_RETAINED_BLOCKS || 4000)
  );
  let apiBase = localApiBase;
  let wsBase = localWsBase;

  $: liveStateLabel = isPaused ? 'PAUSED' : isFollowingLive ? 'LIVE' : 'REVIEW';
  $: liveStateTone = isPaused ? 'warn' : isFollowingLive ? 'good' : 'muted';
  $: nodeCount = nodes.length;
  $: blockCount = blocks.length;
  const sectionNav = [
    { id: 'hero', label: 'Hero' },
    { id: 'overview', label: 'Overview' },
    { id: 'tape', label: 'Tape' },
    { id: 'bottom', label: 'Bottom' }
  ];

  function scrollToSection(id) {
    activeSection = id;
    const target = document.getElementById(id);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function toMsTimestamp(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return numeric < 1e12 ? numeric * 1000 : numeric;
  }

  function normalizeBlock(block) {
    const timestamp = toMsTimestamp(block.timestamp);
    return timestamp === block.timestamp ? block : { ...block, timestamp };
  }

  function blockKey(block) {
    return `${block?.nodeId || 'unknown'}:${block?.hash || 'unknown'}`;
  }

  function mergeBlocks(items) {
    const byKey = new Map();
    for (const block of items.map(normalizeBlock)) {
      byKey.set(blockKey(block), block);
    }
    const cutoff = Date.now() - liveWindowMs;
    return [...byKey.values()]
      .filter((block) => block.timestamp >= cutoff)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-maxRetainedBlocks);
  }

  async function loadWindow() {
    if (syncInFlight) return;
    syncInFlight = true;
    try {
      const res = await fetch(`${apiBase}/api/blocks?limit=2000`);
      blocks = mergeBlocks(await res.json());
      sortBlocks();
    } finally {
      syncInFlight = false;
    }
  }

  async function loadHistory() {
    if (historyLoading || historyExhausted || !blocks.length) return;
    historyLoading = true;
    try {
      const oldestTs = Math.min(...blocks.map((b) => b.timestamp));
      const res = await fetch(`${apiBase}/api/blocks/history?beforeTs=${oldestTs}&limit=300`);
      if (!res.ok) return;
      const older = await res.json();
      if (!older.length) {
        historyExhausted = true;
        return;
      }
      blocks = mergeBlocks([...older, ...blocks]);
      sortBlocks();
    } finally {
      historyLoading = false;
    }
  }

  async function loadOverview() {
    if (overviewInFlight) return;
    overviewInFlight = true;
    try {
      const [overviewRes, nodesRes] = await Promise.all([
        fetch(`${apiBase}/api/network/overview`),
        fetch(`${apiBase}/api/nodes`)
      ]);
      if (overviewRes.ok) overview = await overviewRes.json();
      if (nodesRes.ok) nodes = await nodesRes.json();
    } finally {
      overviewInFlight = false;
    }
  }

  async function resolveBackend() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    try {
      const res = await fetch(`${localApiBase}/api/network/overview`, {
        signal: controller.signal
      });
      if (res.ok) {
        apiBase = localApiBase;
        wsBase = localWsBase;
        return;
      }
    } catch {
      // Local backend is unavailable; fallback to live backend.
    } finally {
      clearTimeout(timeout);
    }
    apiBase = fallbackApiBase;
    wsBase = fallbackWsBase;
  }

  function sortBlocks() {
    blocks = [...blocks].sort((a, b) => {
      if (a.status === 'canonical' && b.status !== 'canonical') return -1;
      if (a.status !== 'canonical' && b.status === 'canonical') return 1;
      if (a.nodeId === b.nodeId) return a.blockHeight - b.blockHeight;
      return a.nodeId.localeCompare(b.nodeId);
    });
  }

  function applyLive(nextBlocks) {
    const addedHashes = [];
    const indexByKey = new Map(blocks.map((block, index) => [blockKey(block), index]));
    for (const incoming of nextBlocks) {
      const b = normalizeBlock(incoming);
      const key = blockKey(b);
      const idx = indexByKey.get(key);
      if (idx >= 0) blocks[idx] = b;
      else {
        indexByKey.set(key, blocks.length);
        blocks.push(b);
        addedHashes.push(key);
      }
    }
    blocks = mergeBlocks(blocks);
    sortBlocks();
    if (addedHashes.length) {
      highlightedHashes = [...new Set([...highlightedHashes, ...addedHashes])];
      clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => {
        highlightedHashes = [];
      }, 1500);
    }
  }

  async function handleSelectBlock(block) {
    selectedBlock = block;
    try {
      const res = await fetch(`${apiBase}/api/blocks/${block.hash}`);
      if (!res.ok) return;
      const fullBlock = await res.json();
      selectedBlock = fullBlock;
    } catch {
      // Keep the already selected local block if network request fails.
    }
  }

  function scheduleReconnect() {
    if (!shouldReconnect) return;
    clearTimeout(reconnectTimer);
    const delay = Math.min(30000, 1000 * 2 ** reconnectAttempt);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(connectWebSocket, delay);
  }

  function connectWebSocket() {
    ws = new WebSocket(`${wsBase}${wsPath}`);

    ws.onopen = () => {
      reconnectAttempt = 0;
      // Backfill any blocks missed during reconnect gaps.
      loadWindow();
    };

    ws.onmessage = (event) => {
      if (isPaused) return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'blocks') applyLive(message.data);
      } catch {
        // Ignore malformed websocket payloads.
      }
    };

    ws.onerror = () => {
      ws?.close();
    };

    ws.onclose = () => {
      scheduleReconnect();
    };
  }

  onMount(async () => {
    shouldReconnect = true;
    await resolveBackend();
    await loadWindow();
    await loadOverview();
    connectWebSocket();
    sectionObserver = new IntersectionObserver(
      (entries) => {
        let bestSection = activeSection;
        let bestRatio = 0;
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestSection = entry.target.id;
          }
        }
        if (bestRatio > 0) activeSection = bestSection;
      },
      {
        root: null,
        threshold: [0.15, 0.3, 0.5, 0.7],
        rootMargin: '-18% 0px -55% 0px'
      }
    );
    for (const section of sectionNav) {
      const el = document.getElementById(section.id);
      if (el) sectionObserver.observe(el);
    }
    // Tight periodic backfill to smooth out inconsistent WS delivery timing.
    syncTimer = setInterval(() => {
      if (!isPaused && isFollowingLive) loadWindow();
    }, 2000);
    overviewTimer = setInterval(loadOverview, 5000);
    return () => {
      shouldReconnect = false;
      sectionObserver?.disconnect();
      clearTimeout(reconnectTimer);
      clearTimeout(highlightTimer);
      clearInterval(syncTimer);
      clearInterval(overviewTimer);
      ws?.close();
    };
  });
</script>

{#if showSplash}
  <SplashScreen on:finish={() => showSplash = false} />
{/if}

<main class="app-shell">
  <nav class="section-rail" aria-label="Page sections">
    {#each sectionNav as section}
      <button
        class="section-dot"
        class:active={activeSection === section.id}
        aria-label={`Jump to ${section.label}`}
        title={section.label}
        on:click={() => scrollToSection(section.id)}
      >
        <span class="section-dot-core"></span>
      </button>
    {/each}
  </nav>

  <header class="masthead" id="hero">
    <div class="masthead-brand">
      <div class="brand-kicker">LIVE TRACE DESK</div>
      <h1>Moyaki Trace Engine</h1>
      <p>
        Real-time blockchain flow, reorg pressure, and node lag in a Bloomberg-style terminal layout.
      </p>
    </div>

    <div class="masthead-metrics">
      <div class="masthead-card">
        <span>ROWS</span>
        <strong>{blockCount.toLocaleString()}</strong>
      </div>
      <div class="masthead-card">
        <span>STATE</span>
        <strong class={`tone-${liveStateTone}`}>{liveStateLabel}</strong>
      </div>
      <div class="masthead-card">
        <span>NODES</span>
        <strong>{nodeCount || '0'}</strong>
      </div>
    </div>
  </header>

  <div class="dashboard-grid">
    <div id="overview">
      <NetworkOverview {overview} {nodes} />
    </div>

    <section class="panel desk-panel" id="tape">
      <div class="desk-header">
        <div>
          <p class="eyebrow">Execution tape</p>
          <h2>Block flow by node</h2>
        </div>
        <div class="desk-context">
          <span class={`status-chip ${liveStateTone}`}>{liveStateLabel}</span>
          <span class="status-chip muted">{blockCount.toLocaleString()} blocks tracked</span>
        </div>
      </div>

      <ChainGrid
        blocks={blocks}
        onSelect={handleSelectBlock}
        highlightedHashes={highlightedHashes}
        isPaused={isPaused}
        isFollowingLive={isFollowingLive}
        historyLoading={historyLoading}
        onNeedHistory={loadHistory}
        onFollowLiveChange={(next) => {
          isFollowingLive = next;
          if (next) {
            historyExhausted = false;
            loadWindow();
          }
        }}
        onJumpToLive={() => {
          isFollowingLive = true;
          historyExhausted = false;
          loadWindow();
        }}
        onTogglePause={() => {
          isPaused = !isPaused;
          if (!isPaused && isFollowingLive) loadWindow();
        }}
      />
    </section>
  </div>

  <BlockModal block={selectedBlock} onClose={() => (selectedBlock = null)} />
  <div id="bottom" class="section-anchor section-anchor-bottom" aria-hidden="true"></div>

  <button class="search-fab" type="button" aria-label="Search">
    <span class="material-icons-round">search</span>
  </button>
</main>
