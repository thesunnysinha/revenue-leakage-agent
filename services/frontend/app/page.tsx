import Chat from "@/components/Chat";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function Home() {
  return (
    <ProtectedRoute>
      <main style={{ height: "100vh" }}>
        <Chat />
      </main>
    </ProtectedRoute>
  );
}
