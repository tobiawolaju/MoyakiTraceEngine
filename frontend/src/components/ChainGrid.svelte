<script>
  import { onDestroy, onMount, tick } from "svelte";
  import { Chart, BarController, BarElement, LinearScale, Tooltip, Legend } from 'chart.js';

  Chart.register(BarController, BarElement, LinearScale, Tooltip, Legend);

  export let blocks = [];
  export let onSelect = () => {};
  export let highlightedHashes = [];
  export let isPaused = false;
  export let isFollowingLive = true;
  export let historyLoading = false;
  export let onTogglePause = () => {};
  export let onNeedHistory = () => {};
  export let onFollowLiveChange = () => {};
  export let onJumpToLive = () => {};

  const statusColors = {
    canonical: "#22c55e",
    pending: "#facc15",
    "rolled-back": "#f97316",
  };
  let rowHeight = 96;
  const visibleWindowMs = 60 * 1000;
  const targetTickCount = 9;
  const tickStepsMs = [
    5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 900000, 1800000,
  ];

  let nowMs = Date.now();
  let scroller;
  let chartCanvas;
  let chartInstance;
  let lastKnownBlockCount = 0;
  let nowTimer;
  let viewportWidth = 1280;
  let historyTriggerLocked = false;

  const nodeSort = (a, b) => {
    const aNum = Number(a.replace(/\D+/g, ""));
    const bNum = Number(b.replace(/\D+/g, ""));
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum !== bNum)
      return aNum - bNum;
    return a.localeCompare(b);
  };

  const ago = (timestamp, now) => {
    const delta = Math.max(0, now - timestamp);
    if (delta < 60000) return `${Math.floor(delta / 1000)} sec ago`;
    if (delta < 3600000) return `${Math.floor(delta / 60000)} min ago`;
    if (delta < 86400000) return `${Math.floor(delta / 3600000)} hr ago`;
    return `${Math.floor(delta / 86400000)} day ago`;
  };

  const pickTickStep = (spanMs) => {
    for (const step of tickStepsMs) {
      if (spanMs / step <= targetTickCount) return step;
    }
    return tickStepsMs[tickStepsMs.length - 1];
  };

  const colorFor = (status) => statusColors[status] || "#94a3b8";

  function jumpToLiveEdge() {
    if (!scroller) return;
    scroller.scrollLeft = scroller.scrollWidth;
  }

  function handleScroll() {
    if (!scroller) return;
    const remaining =
      scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft;
    if (remaining > 120 && isFollowingLive) onFollowLiveChange(false);

    if (
      scroller.scrollLeft < 240 &&
      !historyLoading &&
      !historyTriggerLocked &&
      !isFollowingLive
    ) {
      historyTriggerLocked = true;
      Promise.resolve(onNeedHistory()).finally(() => {
        historyTriggerLocked = false;
      });
    }
  }

  $: nodeIds = [...new Set(blocks.map((b) => b.nodeId))].sort(nodeSort);
  $: highlightedSet = new Set(highlightedHashes);
  $: isMobileLayout = viewportWidth <= 760;
  $: rowHeight = isMobileLayout ? 82 : 96;
  $: dataMinTs = blocks.length ? Math.min(...blocks.map((b) => b.timestamp)) : nowMs - visibleWindowMs;
  $: dataMaxTs = blocks.length ? Math.max(...blocks.map((b) => b.timestamp)) : nowMs;
  $: minTime = Math.min(dataMinTs, nowMs - visibleWindowMs);
  $: maxTime = Math.max(dataMaxTs, nowMs);
  $: spanMs = Math.max(visibleWindowMs, maxTime - minTime);
  $: timelineWidth = Math.max(1200, Math.round((spanMs / 1000) * 20)); // 20px per second is safe for 25+ minutes
  $: toX = (timestamp) => ((timestamp - minTime) / spanMs) * timelineWidth;

  $: if (isFollowingLive && scroller && blocks.length !== lastKnownBlockCount) {
    lastKnownBlockCount = blocks.length;
    tick().then(jumpToLiveEdge);
  }

  $: tickStep = pickTickStep(spanMs);
  $: firstTick = Math.ceil(minTime / tickStep) * tickStep;
  $: ticks = (() => {
    const values = [];
    for (let ts = firstTick; ts <= maxTime; ts += tickStep) values.push(ts);
    return values;
  })();

  function initChart() {
    if (!chartCanvas) return;
    if (chartInstance) chartInstance.destroy();

    const backgroundPlugin = {
      id: "customBackground",
      beforeDraw: (chart) => {
        const { ctx, width, height } = chart;
        ctx.save();
        ctx.fillStyle = "#09090b";
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      },
    };

    const ctx = chartCanvas.getContext("2d");
    chartInstance = new Chart(ctx, {
      type: "bar",
      plugins: [backgroundPlugin],
      data: {
        datasets: [],
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 14, bottom: 14 } },
        scales: {
          x: {
            display: false,
            type: "linear",
            min: minTime,
            max: maxTime,
          },
          y: {
            display: true,
            type: "linear",
            min: -0.5,
            max: nodeIds.length - 0.5,
            reverse: true,
            ticks: { display: false },
            grid: {
              color: "rgba(168, 85, 247, 0.15)",
              drawBorder: false,
              lineWidth: 1,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(9, 9, 11, 0.95)",
            titleColor: "#a855f7",
            bodyColor: "#ffffff",
            borderColor: "rgba(168, 85, 247, 0.3)",
            borderWidth: 1,
            padding: 12,
            cornerRadius: 10,
            callbacks: {
              label: (ctx) => {
                const b = ctx.raw.block;
                if (!b) return null;
                return [
                  `Block #${b.blockHeight}`,
                  `Transactions: ${b.transactions?.length || 0}`,
                  `Status: ${b.status}`,
                ];
              },
            },
          },
        },
        onClick: (event) => {
          const points = chartInstance.getElementsAtEventForMode(
            event,
            "nearest",
            { intersect: true },
            true
          );
          if (points.length) {
            const { datasetIndex, index } = points[0];
            const b = chartInstance.data.datasets[datasetIndex].data[index].block;
            if (b) onSelect(b);
          }
        },
      },
    });
  }

  $: if (chartInstance && nodeIds.length > 0) {
    chartInstance.options.scales.x.min = minTime;
    chartInstance.options.scales.x.max = maxTime;
    chartInstance.options.scales.y.max = nodeIds.length - 0.5;

    const datasets = [];

    nodeIds.forEach((nodeId, nodeIdx) => {
      const nodeBlocks = blocks.filter(b => b.nodeId === nodeId).sort((a,b) => a.timestamp - b.timestamp);
      
      // We use "floating" bars: [y_start, y_end]
      // y_start = nodeIdx - (magnitude_scaled / 2)
      // y_end = nodeIdx + (magnitude_scaled / 2)
      // This centers the bar on the row.
      
      datasets.push({
        label: nodeId,
        data: nodeBlocks.map(b => {
          const txs = b.transactions?.length || 0;
          const mag = Math.min(0.4, 0.1 + Math.sqrt(txs) * 0.05);
          return {
            x: b.timestamp,
            y: [nodeIdx - mag, nodeIdx + mag],
            block: b
          };
        }),
        backgroundColor: nodeBlocks.map(b => colorFor(b.status)),
        borderColor: nodeBlocks.map(b => highlightedSet.has(`${b.nodeId}:${b.hash}`) ? '#ffffff' : 'rgba(255,255,255,0.1)'),
        borderWidth: nodeBlocks.map(b => highlightedSet.has(`${b.nodeId}:${b.hash}`) ? 2 : 1),
        barThickness: isMobileLayout ? 12 : 20,
        borderRadius: 4
      });
    });

    chartInstance.data.datasets = datasets;
    chartInstance.update('none');
  }

  $: if (chartInstance && (timelineWidth || rowHeight)) {
    tick().then(() => {
        chartInstance.resize();
    });
  }

  onMount(() => {
    const handleResize = () => {
      viewportWidth = window.innerWidth;
    };
    handleResize();
    window.addEventListener("resize", handleResize);

    nowTimer = setInterval(() => {
      if (!isPaused && isFollowingLive) nowMs = Date.now();
    }, 1000);

    initChart();

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  });

  onDestroy(() => {
    clearInterval(nowTimer);
    if (chartInstance) chartInstance.destroy();
  });
</script>

<div class="legend">
  <span><i class="dot canonical"></i>Canonical</span>
  <span><i class="dot pending"></i>Pending</span>
  <span><i class="dot rolled-back"></i>Rolled Back</span>
  <div class="legend-controls">
    <button
      class="live-btn"
      on:click={onTogglePause}
      aria-label={isPaused ? "Play live updates" : "Pause live updates"}
      title={isPaused ? "Play" : "Pause"}
    >
      {#if isPaused}
        &#9654;
      {:else}
        &#10074;&#10074;
      {/if}
    </button>
    <button
      class="live-btn jump-btn"
      on:click={() => {
        nowMs = Date.now();
        onFollowLiveChange(true);
        onJumpToLive();
        tick().then(jumpToLiveEdge);
      }}
      disabled={isFollowingLive}
      aria-label="Jump to live"
      title="Jump to live"
    >
      Jump to Live
    </button>
  </div>
</div>

<div class="board">
  <div class="left-column">
    <div class="corner">Nodes</div>
    {#each nodeIds as nodeId}
      <div class="node-label" style="height: {rowHeight}px">{nodeId}</div>
    {/each}
  </div>

  <div class="timeline-scroll" bind:this={scroller} on:scroll={handleScroll}>
    <div class="timeline-header" style={`width:${timelineWidth}px`}>
      {#each ticks as t}
        <div class="tick" style={`left:${toX(t)}px`}>
          <span>{ago(t, nowMs)}</span>
        </div>
      {/each}
    </div>

    <div class="chart-container" style="width: {timelineWidth}px; height: {nodeIds.length * rowHeight}px; position: relative;">
      <canvas bind:this={chartCanvas} width={timelineWidth} height={nodeIds.length * rowHeight}></canvas>
    </div>
  </div>
</div>

<style>
  .chart-container canvas {
    display: block;
    width: 100% !important;
    height: 100% !important;
    cursor: crosshair;
  }
</style>



