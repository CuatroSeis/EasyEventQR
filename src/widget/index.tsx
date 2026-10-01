import { createRoot } from 'react-dom/client'
import { WidgetApp } from './WidgetApp'
import './widget.css'

const TAG_NAME = 'ticket-widget'

class TicketWidget extends HTMLElement {
  static observedAttributes = ['evento-id', 'theme']

  private shadow: ShadowRoot
  private root: ReturnType<typeof createRoot> | null = null

  constructor() {
    super()
    this.shadow = this.attachShadow({ mode: 'open' })
  }

  connectedCallback() {
    const eventoId = this.getAttribute('evento-id')
    const theme = (this.getAttribute('theme') as 'light' | 'dark' | 'auto') || 'auto'

    if (!eventoId) {
      this.renderError('Falta atributo evento-id')
      return
    }

    const container = document.createElement('div')
    this.shadow.appendChild(container)
    this.root = createRoot(container)
    this.root.render(<WidgetApp eventoId={eventoId} theme={theme} />)
  }

  attributeChangedCallback(name: string, _old: string, nuevo: string) {
    if (name === 'evento-id' && nuevo) {
      if (this.root) {
        this.root.render(<WidgetApp eventoId={nuevo} theme={this.getAttribute('theme') as 'light' | 'dark' | 'auto'} />)
      }
    }
  }

  private renderError(msg: string) {
    const container = document.createElement('div')
    this.shadow.appendChild(container)
    this.root = createRoot(container)
    this.root.render(
      <div style={{ padding: 24, textAlign: 'center', color: '#dc2626', background: '#fef2f2', borderRadius: 12 }}>
        No se pudo cargar el evento.<br />
        <code>{msg}</code>
      </div>
    )
  }
}

if (!customElements.get(TAG_NAME)) {
  customElements.define(TAG_NAME, TicketWidget)
}

export { TicketWidget, TAG_NAME }