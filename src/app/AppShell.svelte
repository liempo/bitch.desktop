<script lang="ts">
  import AgentShell from './agent/AgentShell.svelte'
  import FilesPage from './files/FilesPage.svelte'
  import MainPage from './main/MainPage.svelte'
  import AppNavbar from './navigation/AppNavbar.svelte'
  import { appRouterState } from './router.svelte'
</script>

<div class="h-full" data-theme="cyberpunk">
  <div class="relative isolate flex h-full w-full flex-col overflow-hidden bg-chat-scroll">
    <AppNavbar />

    <main class="relative z-10 min-h-0 flex-1 overflow-hidden">
      {#if appRouterState.page === 'agent'}
        <AgentShell />
      {:else if appRouterState.page === 'files'}
        <FilesPage />
      {:else}
        <MainPage />
      {/if}
    </main>
  </div>
</div>
