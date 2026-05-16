<script>
  import { onMount, createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  const blocks = Array.from({ length: 28 }, (_, index) => {
    const pink = index % 4 === 0 || index % 7 === 0;
    return {
      id: index,
      left: (index * 7.3) % 100,
      size: 10 + (index % 5) * 6,
      delay: -(index * 0.32),
      duration: 2.8 + (index % 6) * 0.35,
      opacity: pink ? (index % 8 === 0 ? 1 : 0.82) : 0.2,
      color: pink ? 'purple' : 'white',
      drift: (index % 3 - 1) * 12
    };
  });

  onMount(() => {
    const timer = setTimeout(() => {
      dispatch('finish');
    }, 5000);
    return () => clearTimeout(timer);
  });
</script>

<div class="splash-screen">
  <div class="splash-field" aria-hidden="true">
    {#each blocks as block}
      <span
        class={`splash-square ${block.color}`}
        style={`left:${block.left}%; width:${block.size}px; height:${block.size}px; opacity:${block.opacity}; animation-delay:${block.delay}s; animation-duration:${block.duration}s; --drift:${block.drift}px;`}
      ></span>
    {/each}
  </div>
  <div class="splash-content">
    <div class="splash-stack">
      <h1 class="splash-word splash-purple">Moyaki</h1>
      <h1 class="splash-word splash-white">Trace</h1>
      <h1 class="splash-word splash-white">Engine</h1>
    </div>
  </div>
</div>
