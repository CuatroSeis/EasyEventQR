/**
 * Entry point del BUILD 2 — el widget.
 *
 * Este archivo es el que se descarga el sitio del organizador con:
 *
 *   <script src="https://easyeventqr.vercel.app/widget/widget.js"></script>
 *   <ticket-widget event-id="abc123"></ticket-widget>
 *
 * Su único trabajo en la Fase 0 es registrar el custom element para
 * demostrar que el segundo build compila y produce un IIFE usable.
 */
import { registrarTicketWidget } from './ticket-widget'

registrarTicketWidget()
