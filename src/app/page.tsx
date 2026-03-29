import Office from "@/components/Office";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="py-6 text-center">
        <h1 className="pixel-text text-2xl sm:text-3xl font-bold tracking-wider">
          <span className="text-blue-400">Mind</span>
          <span className="text-orange-400">Fork</span>
          <span className="text-gray-400 ml-2">Office</span>
        </h1>
        <p className="text-gray-500 text-xs pixel-text mt-2">
          Click on a team member to learn more
        </p>
      </header>

      {/* Office scene */}
      <main className="flex-1 flex items-start justify-center px-4 pb-8">
        <Office />
      </main>

      {/* Footer */}
      <footer className="py-4 text-center border-t border-gray-800">
        <p className="text-gray-600 text-[10px] pixel-text">
          MindFork Team &middot; Pixel Office v0.1
        </p>
      </footer>
    </div>
  );
}
