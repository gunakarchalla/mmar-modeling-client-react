import AppLayout from "@/views/layout/AppLayout";

// P6: the real modeling shell. All chrome (top nav, toolbar, tabs, state window,
// left/right nav, canvas, footer) plus the sign-in dialog and snackbar live in
// AppLayout. The engine boots inside ThreeCanvas (engine.mount) once a user is
// logged in and the body renders.
export default function App() {
  return <AppLayout />;
}
