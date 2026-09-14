/**
 * `server-only` ships as untyped JavaScript. It is imported purely for its
 * side effect: bundling it from a Client Component is a build-time error.
 */
declare module "server-only";
