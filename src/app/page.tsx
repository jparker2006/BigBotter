export default function Home() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-[radial-gradient(circle_at_top,#f7d94c_0,#f7d94c_18%,#103f73_19%,#071422_58%,#02050a_100%)] px-6 py-16 text-white">
      <main className="w-full max-w-3xl rounded-3xl border border-white/20 bg-black/55 p-10 shadow-2xl backdrop-blur">
        <p className="text-sm font-black uppercase tracking-[0.45em] text-yellow-300">Big Botter</p>
        <h1 className="mt-5 text-5xl font-black tracking-tight sm:text-7xl">The engine is the show.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200">
          Milestone 1 is a deterministic, console-first Big Brother season simulator. Run{" "}
          <code className="rounded bg-white/15 px-2 py-1 font-mono text-yellow-200">pnpm sim --seed=12345</code> to
          watch a full placeholder season.
        </p>
      </main>
    </div>
  );
}
