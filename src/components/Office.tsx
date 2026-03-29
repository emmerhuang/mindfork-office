"use client";

import { members } from "@/data/members";
import Workstation from "./Workstation";
import Floor from "./Floor";

export default function Office() {
  // Layout: Secretary in center, others around
  // Row 1: Sherlock, Secretary, Lego
  // Row 2: Vault, Forge, Lens
  // Row 3: Waffles (centered)
  const row1 = members.filter((m) =>
    ["sherlock", "secretary", "lego"].includes(m.id)
  );
  const row2 = members.filter((m) =>
    ["vault", "forge", "lens"].includes(m.id)
  );
  const waffles = members.find((m) => m.id === "waffles")!;

  // Sort to ensure secretary is in the middle
  const sortOrder1 = ["sherlock", "secretary", "lego"];
  const sortOrder2 = ["vault", "forge", "lens"];
  row1.sort((a, b) => sortOrder1.indexOf(a.id) - sortOrder1.indexOf(b.id));
  row2.sort((a, b) => sortOrder2.indexOf(a.id) - sortOrder2.indexOf(b.id));

  return (
    <div className="relative w-full max-w-3xl mx-auto">
      {/* Floor pattern */}
      <Floor />

      {/* Office walls (decorative) */}
      <div className="relative z-10 py-8 px-4">
        {/* Wall decoration top */}
        <div className="flex justify-center gap-8 mb-2 opacity-30">
          <div className="w-8 h-6 border border-yellow-700 rounded-[1px]" />
          <div className="w-12 h-6 border border-yellow-700 rounded-[1px]" />
          <div className="w-8 h-6 border border-yellow-700 rounded-[1px]" />
        </div>

        {/* Row 1: Sherlock - Secretary (center, larger) - Lego */}
        <div className="flex justify-center items-end gap-6 sm:gap-10 mb-8">
          {row1.map((member) => (
            <div
              key={member.id}
              className={member.id === "secretary" ? "scale-110" : ""}
            >
              <Workstation member={member} />
            </div>
          ))}
        </div>

        {/* Divider (carpet/rug) */}
        <div className="flex justify-center mb-8">
          <div className="w-48 h-1 bg-gradient-to-r from-transparent via-yellow-800/40 to-transparent rounded-full" />
        </div>

        {/* Row 2: Vault - Forge - Lens */}
        <div className="flex justify-center items-end gap-6 sm:gap-10 mb-8">
          {row2.map((member) => (
            <Workstation key={member.id} member={member} />
          ))}
        </div>

        {/* Waffles corner */}
        <div className="flex justify-center">
          <div className="relative">
            {/* Dog bed area */}
            <div className="absolute -inset-3 bg-yellow-900/20 rounded-full" />
            <Workstation member={waffles} />
          </div>
        </div>
      </div>
    </div>
  );
}
