"use client";

interface Project {
  name: string;
  url: string;
  description: string;
  color: string;
  icon: string;
  version: string;
}

const projects: Project[] = [
  {
    name: "rotaryCredit",
    url: "https://rotarycredit.vercel.app",
    description: "扶輪信用稽核預警系統",
    color: "#e74c3c",
    icon: "CREDIT",
    version: "v1.0.0",
  },
  {
    name: "account-rotary",
    url: "https://account-rotary.vercel.app",
    description: "扶輪會計系統",
    color: "#3498db",
    icon: "ACCT",
    version: "v0.1.0",
  },
  {
    name: "WaHoot Rotary",
    url: "https://wahoot-rotary.vercel.app",
    description: "互動問答系統",
    color: "#2ecc71",
    icon: "QUIZ",
    version: "v1.0.0",
  },
  {
    name: "rotarysso",
    url: "https://rotarysso.vercel.app",
    description: "扶輪 SSO 單一登入",
    color: "#9b59b6",
    icon: "SSO",
    version: "v1.0.0",
  },
];

export default function ProjectShowcase() {
  return (
    <div className="w-full max-w-lg mx-auto px-4">
      {/* Section title */}
      <div className="flex items-center gap-3 mb-4">
        <div className="h-px flex-1 bg-amber-700/20" />
        <h2 className="pixel-text text-xs text-amber-800/60">COMPLETED WORKS</h2>
        <div className="h-px flex-1 bg-amber-700/20" />
      </div>

      {/* Project cards grid */}
      <div className="grid grid-cols-2 gap-3">
        {projects.map((project) => (
          <a
            key={project.name}
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative bg-white/80 border border-amber-300/50 hover:border-amber-500 rounded-lg p-3 transition-all hover:-translate-y-1 shadow-sm hover:shadow-md"
          >
            {/* Pixel icon */}
            <div
              className="w-full h-10 mb-2 flex items-center justify-center rounded pixel-text text-[10px] font-bold text-white"
              style={{ background: project.color }}
            >
              {project.icon}
            </div>

            {/* Name + Version */}
            <div className="flex items-baseline justify-between mb-1">
              <p className="pixel-text text-[9px] text-gray-800 truncate">
                {project.name}
              </p>
              <span className="pixel-text text-[8px] text-gray-400 shrink-0 ml-1">
                {project.version}
              </span>
            </div>

            {/* Description */}
            <p className="text-[10px] text-gray-500 leading-tight">
              {project.description}
            </p>

            {/* Link indicator */}
            <div className="absolute top-2 right-2 text-gray-300 group-hover:text-gray-500 text-xs">
              ↗
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
