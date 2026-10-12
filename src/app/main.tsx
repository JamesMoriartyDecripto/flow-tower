// `?doc=` is the printable document view; everything else is the app. Each is loaded with a dynamic
// import, so the document page never loads three.js / react-three-fiber.
const root = document.getElementById('root')!;
if (new URLSearchParams(location.search).has('doc')) {
  void import('./doc/DocView').then((m) => m.mountDoc(root));
} else {
  void import('./mountApp').then((m) => m.mountApp(root));
}
