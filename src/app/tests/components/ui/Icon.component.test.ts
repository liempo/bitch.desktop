// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/svelte'
import { afterEach, describe, expect, it } from 'vitest'

import Icon from '../../../components/ui/Icon.svelte'

afterEach(cleanup)

describe('Icon UI', () => {
  it('renders a labelled SVG icon as an accessible image', () => {
    const { container } = render(Icon, { name: 'settings', label: 'Settings' })

    const icon = screen.getByRole('img', { name: 'Settings' })
    expect(icon).not.toHaveAttribute('aria-hidden')
    expect(icon).toHaveClass('prime-icon')
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('hides decorative icons from the accessibility tree by default', () => {
    render(Icon, { name: 'menu' })

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(document.querySelector('.prime-icon')).toHaveAttribute('aria-hidden', 'true')
  })
})
