// WebAssembly files imported by the Worker (the link-preview picture's engines).
declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}
