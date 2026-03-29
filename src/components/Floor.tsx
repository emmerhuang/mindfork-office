"use client";

// Isometric floor tiles (decorative background)
export default function Floor() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
      <div
        className="w-full h-full"
        style={{
          backgroundImage: `
            linear-gradient(45deg, #3a3a4d 25%, transparent 25%),
            linear-gradient(-45deg, #3a3a4d 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #3a3a4d 75%),
            linear-gradient(-45deg, transparent 75%, #3a3a4d 75%)
          `,
          backgroundSize: "40px 40px",
          backgroundPosition: "0 0, 0 20px, 20px -20px, -20px 0px",
        }}
      />
    </div>
  );
}
