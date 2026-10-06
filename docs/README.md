# Documentación

Los documentos están ordenados por *qué se leen*, no por cuándo se escribieron.
La regla que los separa es esta: **un doc de arquitectura dice cómo es el
sistema; un doc de operación dice cómo se lo usa; un doc de estado dice qué
se hizo.** Un archivo que no encaja en ninguna de las tres no va acá.

```
docs/
├── arquitectura/   QUÉ es el sistema. Cambia sólo cuando cambia el diseño.
├── operacion/      CÓMO se opera. Cambia cuando cambia el flujo de trabajo.
└── estado/        QUÉ se hizo y qué falta. Cambia en cada sesión.
```

## arquitectura/

| Doc | Para qué |
|---|---|
| [SPEC.md](./arquitectura/SPEC.md) | Fuente de verdad del producto: modelo de datos, endpoints, reglas de seguridad y criterios de "definition of done". Es el documento que define el comportamiento esperado. |
| [PLAN.md](./arquitectura/PLAN.md) | Por qué el sistema es como es. Cada decisión que no se entiende leyendo el código, y las alternativas descartadas. |
| [ENDPOINTS.md](./arquitectura/ENDPOINTS.md) | Mapa de endpoints y el recorrido E2E de 12 pasos. Es la lista de verificación del MVP. |

## operacion/

| Doc | Para qué |
|---|---|
| [GUIA_MANUAL.md](./operacion/GUIA_MANUAL.md) | Configuración desde cero: credenciales de Firebase, Vercel, Brevo, service account yVariables de entorno. |
| [CI_CD.md](./operacion/CI_CD.md) | Pipeline, jobs, gates y qué hace cada uno. |

## estado/

| Doc | Para qué |
|---|---|
| [ESTADO.md](./estado/ESTADO.md) | Estado actual, pendientes y cómo verificar. Se actualiza en cada sesión. |
| [CHANGELOG.md](../CHANGELOG.md) | Bitácora comprimida por sesión (el detalle vive en git). |

## La raíz

`README.md` sigue en la raíz a propósito: es lo primero que lee alguien que
nunca vio el repo, y las convenciones de la raíz (un archivo de cada tipo) lo
hacen más fácil de encontrar.