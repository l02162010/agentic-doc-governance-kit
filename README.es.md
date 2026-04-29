# Agentic Doc Governance Kit (Español)

> ⚠️ Este documento es una traducción comunitaria. **La única fuente canónica y más actualizada es el README en inglés**: [`README.md`](./README.md).

Un kit de gobernanza documental para proyectos de software gestionados por agentes de IA, con flujos reutilizables, verificables y trazables para documentación y ciclo de vida de funcionalidades.

## Inicio rápido

```bash
node bin/agentic-doc-governance.mjs init /path/to/your-project
# o (después de publicar en npm):
npx agentic-doc-governance-kit init /path/to/your-project
```

Después de inicializar, ejecuta en el repositorio destino:

```bash
node scripts/docs-integrity-check.mjs --check-generated
node scripts/skills-integrity-check.mjs
node scripts/agent-closeout-check.mjs --feature FEAT-001
```

## Puntos clave

- Estructura estándar para gobernanza documental y ciclo de vida de funcionalidades.
- Validadores integrados (docs / skills / closeout).
- Flujo CLI con `feature add` y `feature status`.

Para la documentación completa y vigente (flags, ejemplos, límites y comportamiento), usa la versión en inglés: [`README.md`](./README.md).
