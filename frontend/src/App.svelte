<script>
  import { onMount } from 'svelte';
  import ChainGrid from './components/ChainGrid.svelte';
  import BlockModal from './components/BlockModal.svelte';

  let blocks = [];
  let paused = false;
  let selectedBlock = null;
  let replayIndex = 0;
  let replayMode = false;

  const apiBase = 'http://localhost:4000';

  async function loadWindow() {
    const res = await fetch(`${apiBase}/api/blocks`);
    blocks = await res.json();
    sortBlocks();
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
    for (const b of nextBlocks) {
      const idx = blocks.findIndex((x) => x.hash === b.hash);
      if (idx >= 0) blocks[idx] = b;
      else blocks.push(b);
    }
    const cutoff = Date.now() - 60 * 60 * 1000;
    blocks = blocks.filter((b) => b.timestamp >= cutoff);
    sortBlocks();
  }

  function stepReplay() {
    replayMode = true;
    replayIndex = Math.min(blocks.length - 1, replayIndex + 1);
  }

  $: replayBlocks = replayMode ? blocks.slice(0, replayIndex + 1) : blocks;

  onMount(async () => {
    await loadWindow();
    const ws = new WebSocket('ws://localhost:4000/ws');

    ws.onmessage = (event) => {
      if (paused) return;
      const message = JSON.parse(event.data);
      if (message.type === 'blocks') applyLive(message.data);
    };

    return () => ws.close();
  });
</script>

<main>
  <h1>Execution Trace Timeline</h1>
  <div class="controls">
    <button on:click={() => (paused = !paused)}>{paused ? 'Resume' : 'Pause'} Live</button>
    <button on:click={loadWindow}>Rewind 1h</button>
    <button on:click={stepReplay}>Replay Step</button>
  </div>

  <ChainGrid blocks={replayBlocks} onSelect={(b) => (selectedBlock = b)} />
  <BlockModal block={selectedBlock} onClose={() => (selectedBlock = null)} />
</main>

<style>
  :global(body) {
    margin: 0;
    background:
      radial-gradient(circle at 10% 0%, #0b3558 0%, transparent 35%),
      radial-gradient(circle at 100% 100%, #312e81 0%, transparent 40%),
      #030712;
  }

  main {
    min-height: 100vh;
    box-sizing: border-box;
    padding: 18px;
    color: #e2e8f0;
    font-family: 'Space Grotesk', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  }

  h1 {
    margin: 0 0 12px;
    font-size: clamp(1.2rem, 2.8vw, 1.8rem);
    letter-spacing: 0.01em;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  button {
    padding: 7px 12px;
    border-radius: 8px;
    border: 1px solid #334155;
    background: #0f172a;
    color: #e2e8f0;
    font: inherit;
    cursor: pointer;
  }

  @media (max-width: 720px) {
    main {
      padding: 12px;
    }
  }
</style>
