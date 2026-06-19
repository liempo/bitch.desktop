import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!
})

const splash = document.getElementById('bitch-splash')
const SPLASH_MIN_DURATION_MS = 2600
const SPLASH_REMOVE_AFTER_MS = 3600

if (splash) {
  window.setTimeout(() => {
    document.documentElement.classList.add('bitch-app-ready')
  }, SPLASH_MIN_DURATION_MS)

  splash.addEventListener(
    'transitionend',
    event => {
      if (event.target === splash) splash.remove()
    },
    { once: true }
  )

  window.setTimeout(() => splash.remove(), SPLASH_REMOVE_AFTER_MS)
}

export default app
