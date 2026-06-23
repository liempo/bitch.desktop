<script lang="ts">
  import AgentShell from './agent/AgentShell.svelte'
  import AssetsPage from './assets/AssetsPage.svelte'
  import CalendarPage from './calendar/CalendarPage.svelte'
  import CronPage from './cron/CronPage.svelte'
  import KanbanPage from './kanban/KanbanPage.svelte'
  import StartupSplash from './components/StartupSplash.svelte'
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
      {:else if appRouterState.page === 'assets'}
        <AssetsPage />
      {:else if appRouterState.page === 'calendar'}
        <CalendarPage />
      {:else if appRouterState.page === 'cron'}
        <CronPage />
      {:else if appRouterState.page === 'kanban'}
        <KanbanPage />
      {:else}
        <MainPage />
      {/if}
    </main>

    <StartupSplash />
  </div>
</div>
