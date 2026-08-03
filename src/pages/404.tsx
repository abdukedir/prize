export default function NotFoundPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif" }}>
      <section style={{ textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: 48 }}>404</h1>
        <p style={{ marginTop: 8, color: "#52525b" }}>Page not found</p>
      </section>
    </main>
  );
}