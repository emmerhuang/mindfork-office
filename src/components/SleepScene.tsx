"use client";

import { useState, useEffect } from "react";

const scenes = [
  {
    emoji: "😴",
    title: "全員休息中",
    description: "Rate limit 到頂了，大家在辦公室裡呼呼大睡...",
    bg: "from-indigo-900/30 to-purple-900/20",
  },
  {
    emoji: "🏃",
    title: "團隊慢跑中",
    description: "趁休息時間一起去河濱跑步，Waffles 跑最快！",
    bg: "from-green-800/20 to-emerald-700/20",
  },
  {
    emoji: "🧺",
    title: "野餐時光",
    description: "秘書長帶大家到公園野餐，Sherlock 在研究螞蟻...",
    bg: "from-yellow-700/20 to-amber-600/20",
  },
  {
    emoji: "🍜",
    title: "團隊聚餐",
    description: "Forge 說吃飽才有力氣寫 code，Vault 點了三碗飯。",
    bg: "from-red-800/20 to-orange-700/20",
  },
  {
    emoji: "🎮",
    title: "打電動放鬆",
    description: "Lego 在組隊打 Boss，Lens 在旁邊幫忙看攻略。",
    bg: "from-blue-800/20 to-cyan-700/20",
  },
  {
    emoji: "☕",
    title: "咖啡時間",
    description: "老大請大家喝咖啡，Waffles 偷喝了牛奶。",
    bg: "from-amber-800/20 to-yellow-700/20",
  },
];

export default function SleepScene() {
  const [sceneIndex, setSceneIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSceneIndex((prev) => (prev + 1) % scenes.length);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const scene = scenes[sceneIndex];

  return (
    <div className="w-full max-w-md mx-auto text-center py-12 px-6">
      <div className={`rounded-2xl p-8 bg-gradient-to-br ${scene.bg} transition-all duration-1000`}>
        {/* Big emoji */}
        <div className="text-7xl mb-6 animate-idle">{scene.emoji}</div>

        {/* Title */}
        <h2 className="pixel-text text-lg text-white font-bold mb-3">
          {scene.title}
        </h2>

        {/* Description */}
        <p className="text-white/70 text-sm leading-relaxed mb-6">
          {scene.description}
        </p>

        {/* ZZZ animation */}
        <div className="flex justify-center gap-2 mb-4">
          <span className="text-2xl animate-zzz inline-block text-blue-400/60">Z</span>
          <span className="text-3xl animate-zzz inline-block text-blue-500/60" style={{ animationDelay: "0.5s" }}>Z</span>
          <span className="text-4xl animate-zzz inline-block text-blue-600/60" style={{ animationDelay: "1s" }}>Z</span>
        </div>

        {/* Scene dots */}
        <div className="flex justify-center gap-2">
          {scenes.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all ${
                i === sceneIndex ? "bg-amber-700 scale-125" : "bg-amber-400/40"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
