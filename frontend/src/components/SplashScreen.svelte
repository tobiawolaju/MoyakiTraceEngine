<script>
  import { onMount, createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  onMount(() => {
    const timer = setTimeout(() => {
      dispatch('finish');
    }, 5000);
    return () => clearTimeout(timer);
  });
</script>

<div class="splash-screen">
  <div class="splash-content">
    <div class="splash-ribbon">LIVE MARKET FEED</div>
    <h1 class="splash-logo2">MOYAKI</h1>
    <h1 class="splash-logo">TRACE</h1>
    <h1 class="splash-logo">ENGINE</h1>
    <p class="splash-sub">Orderly, compressed, and built for people who want the tape before the story.</p>
  </div>
</div>
