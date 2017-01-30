# indexed-db-observers
Prototyping and discussion around IndexedDB observers.

Please see the **[Explainer & FAQ](EXPLAINER.md)** for use cases, spec changes, and feature explanation.

# Polyfill
The polyfill is currently out of date.

Caveats:
 * It doesn't broadcast changes across browsing contexts.
 * Not very memory efficient.
