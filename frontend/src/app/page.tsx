import { apiGet } from "@/lib/api";

type Hello = { message: string };

export default async function Home() {
  let message: string;
  let connected = true;

  try {
    const data = await apiGet<Hello>("/api/hello");
    message = data.message;
  } catch {
    connected = false;
    message = "Could not reach the backend. Is FastAPI running on :8000?";
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 p-8 font-sans dark:bg-black">
      <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
        Founders Inc
      </h1>
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            connected ? "bg-green-500" : "bg-red-500"
          }`}
        />
        <span className="text-zinc-600 dark:text-zinc-400">
          {connected ? "Backend connected" : "Backend offline"}
        </span>
      </div>
      <p className="max-w-md text-center text-lg text-zinc-800 dark:text-zinc-200">
        {message}
      </p>
    </main>
  );
}
