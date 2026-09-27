import { aplicarTema, type Tema } from '@shared/theming'

/**
 * <ticket-widget event-id="..."> — el formulario de registro embebible.
 *
 * Shadow DOM: attachShadow() crea un árbol de nodos paralelo, con su
 * propio espacio de nombres. El CSS del sitio donde se embebe NO entra
 * acá, y el CSS de acá NO sale. Por eso el widget se ve igual en
 * cualquier página, y por eso las clases del organizador no pueden
 * romper el formulario (ni al revés).
 *
 * Consecuencia: el CSS de la app tampoco llega. En la Fase 4 hay que
 * inyectar dentro del shadowRoot una hoja de estilos propia.
 */

/** Estilo del shadow root. Va como string porque <style> es HTML, no CSS de Tailwind. */
const ESTILO = `
  :host { display: block; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
  .caja { max-width: 420px; margin: 0 auto; border: 1px solid var(--c-borde);
          border-radius: 16px; background: var(--c-superficie); padding: 20px; }
  h3 { margin: 0 0 4px; font-size: 16px; color: var(--c-texto); }
  p  { margin: 0; font-size: 13px; color: var(--c-texto-suave); }
  .marca { display: inline-block; margin-bottom: 12px; padding: 4px 10px; border-radius: 999px;
           background: var(--c-primario); color: var(--c-sobre-primario);
           font-size: 11px; font-weight: 600; letter-spacing: .02em; }
  .evento { margin-top: 10px; font-family: ui-monospace, monospace; font-size: 12px;
            color: var(--c-texto-suave); }
`

/** Tema de ejemplo. En la Fase 4 sale de /api/evento-publico. */
const TEMA_EJEMPLO: Tema = { colorPrimario: '#7c3aed', colorSecundario: '#0f172a' }

export class TicketWidget extends HTMLElement {
  /** # = campo privado real de JavaScript, no una convención de TypeScript. */
  #raiz: ShadowRoot
  #eventoId: string | null = null

  /** Sólo reacciona a los atributos que le importan. */
  static observedAttributes = ['event-id']

  constructor() {
    super()
    this.#raiz = this.attachShadow({ mode: 'open' })
  }

  connectedCallback() {
    // El elemento ya está en el DOM: ahora sí se puede leer el atributo.
    this.#eventoId = this.getAttribute('event-id')
    this.#pintar()
  }

  attributeChangedCallback(nombre: string, _anterior: string | null, nuevo: string | null) {
    if (nombre !== 'event-id') return
    this.#eventoId = nuevo
    if (this.isConnected) this.#pintar()
  }

  #pintar() {
    // El MISMO módulo de theming que usa la app principal. La única
    // diferencia es el segundo argumento: acá es el elemento host
    // (`this`), no document.documentElement. Las variables CSS heredan
    // a través de la frontera del Shadow DOM, así que escribirlas en el
    // host las alcanza todo el shadow tree.
    aplicarTema(TEMA_EJEMPLO, this)

    // innerHTML sólo para el <style>, que es una constante nuestra.
    this.#raiz.innerHTML = ESTILO

    // El contenido que viene de datos se arma con textContent, nunca con
    // innerHTML: el nombre del evento lo escribe un tercero y meterlo
    // como HTML sería un XSS esperando a ocurrir.
    const caja = document.createElement('div')
    caja.className = 'caja'

    const marca = document.createElement('span')
    marca.className = 'marca'
    marca.textContent = 'EASYEVENTQR'
    caja.append(marca)

    const titulo = document.createElement('h3')
    titulo.textContent = 'Formulario de registro'
    caja.append(titulo)

    const texto = document.createElement('p')
    texto.textContent = 'Fase 0: el widget ya compila, tiene Shadow DOM y aplica su propio tema.'
    caja.append(texto)

    if (this.#eventoId) {
      const evento = document.createElement('p')
      evento.className = 'evento'
      evento.textContent = `event-id recibido: ${this.#eventoId}`
      caja.append(evento)
    }

    this.#raiz.append(caja)
  }
}

/**
 * Registrar el elemento es idempotente a propósito: si el sitio del
 * organizador incluye el script dos veces, customElements.define() tira
 * NotSupportedError y se rompe toda la página.
 */
export function registrarTicketWidget(): void {
  if (customElements.get('ticket-widget')) return
  customElements.define('ticket-widget', TicketWidget)
}
