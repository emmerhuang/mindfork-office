"use client";

export default function Floor() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Wall (upper portion) */}
      <div
        className="absolute top-0 left-0 right-0 h-[35%]"
        style={{
          background: "linear-gradient(180deg, #5b7a6a 0%, #4a6858 100%)",
        }}
      >
        {/* Wall trim / baseboard */}
        <div className="absolute bottom-0 left-0 right-0 h-2 bg-[#3d5548]" />
        {/* Window left */}
        <div className="absolute top-[20%] left-[8%] w-16 h-14 border-4 border-[#8b7355] bg-[#87ceeb]/40 rounded-sm">
          <div className="absolute inset-0 border border-[#8b7355] m-1" />
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[#8b7355]" />
          <div className="absolute left-0 right-0 top-1/2 h-px bg-[#8b7355]" />
        </div>
        {/* Window right */}
        <div className="absolute top-[20%] right-[8%] w-16 h-14 border-4 border-[#8b7355] bg-[#87ceeb]/40 rounded-sm">
          <div className="absolute inset-0 border border-[#8b7355] m-1" />
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[#8b7355]" />
          <div className="absolute left-0 right-0 top-1/2 h-px bg-[#8b7355]" />
        </div>
        {/* Wall clock center */}
        <div className="absolute top-[15%] left-1/2 -translate-x-1/2 w-8 h-8 rounded-full border-2 border-[#8b7355] bg-[#f5f0e0]">
          <div className="absolute top-1/2 left-1/2 w-0.5 h-3 bg-gray-700 -translate-x-1/2 origin-bottom -rotate-12" />
          <div className="absolute top-1/2 left-1/2 w-0.5 h-2 bg-gray-700 -translate-x-1/2 origin-bottom rotate-45" />
        </div>
        {/* Bookshelf left */}
        <div className="absolute bottom-3 left-[25%] w-12 h-10 bg-[#6b4c30] rounded-t-sm border border-[#5a3c20]">
          <div className="flex gap-0.5 px-0.5 pt-1">
            <div className="w-1.5 h-3 bg-[#c0392b]" />
            <div className="w-1.5 h-3 bg-[#2980b9]" />
            <div className="w-1 h-3 bg-[#f39c12]" />
            <div className="w-1.5 h-3 bg-[#27ae60]" />
            <div className="w-1 h-3 bg-[#8e44ad]" />
          </div>
          <div className="h-px bg-[#5a3c20] mx-0.5 my-0.5" />
          <div className="flex gap-0.5 px-0.5">
            <div className="w-1 h-2.5 bg-[#e74c3c]" />
            <div className="w-2 h-2.5 bg-[#3498db]" />
            <div className="w-1.5 h-2.5 bg-[#e67e22]" />
            <div className="w-1 h-2.5 bg-[#1abc9c]" />
          </div>
        </div>
        {/* Plant right */}
        <div className="absolute bottom-3 right-[25%]">
          <div className="w-3 h-4 bg-[#5a3c20] rounded-b-sm mx-auto" />
          <div className="absolute -top-3 left-0 w-3 h-4 bg-[#27ae60] rounded-full" />
          <div className="absolute -top-4 left-1 w-2 h-3 bg-[#2ecc71] rounded-full" />
          <div className="absolute -top-2 -left-1 w-2.5 h-3 bg-[#27ae60] rounded-full" />
        </div>
      </div>

      {/* Floor (lower portion) - wooden planks */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[65%]"
        style={{
          background: `
            repeating-linear-gradient(
              90deg,
              #c4a87a 0px, #c4a87a 60px,
              #b89868 60px, #b89868 61px,
              #c9ad80 61px, #c9ad80 120px,
              #b89868 120px, #b89868 121px
            )
          `,
        }}
      >
        {/* Plank horizontal lines */}
        <div className="absolute inset-0" style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent 0px, transparent 19px, #b8986855 19px, #b8986855 20px)",
        }} />
        {/* Rug in the center */}
        <div className="absolute top-[30%] left-1/2 -translate-x-1/2 w-[70%] h-[45%] rounded-lg opacity-30"
          style={{
            background: "radial-gradient(ellipse, #8b4513 0%, #a0522d 50%, transparent 70%)",
          }}
        />
      </div>
    </div>
  );
}
