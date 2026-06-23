import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!
})

const prebundleSplash = document.getElementById('bitch-splash')
prebundleSplash?.remove()

export default app
