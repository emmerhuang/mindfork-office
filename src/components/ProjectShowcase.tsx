"use client";

interface Project {
  name: string;
  url: string;
  description: string;
  color: string;
  icon: string;
}

const projects: Project[] = [
  {
    name: "rotaryCredit",
    url: "https://rotarycredit.vercel.app",
    description: "扶輪信用稽核預警系統",
    color: "#e74c3c",
    icon: "CREDIT",
  },
  {
    name: "account-rotary",
    url: "https://account-rotary.vercel.app",
    description: "扶輪會計系統",
    color: "#3498db",
    icon: "ACCT",
  },
  {
    name: "WaHoot Rotary",
    url: "https://wahoot-rotary.vercel.app",
    description: "互動問答系統",
    color: "#2ecc71",
    icon: "QUIZ",
  },
  {
    name: "rotarysso",
    url: "https://rotarysso.vercel.app",
    description: "扶輪 SSO 單一登入",
    color: "#9b59b6",
    icon: "SSO",
  },
];

export default function ProjectShowcase() {
  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      {/* Section title */}
      <div className="flex items-center gap-3 mb-4">
        <div className="h-px flex-1 bg-gray-700" />
        <h2 className="pixel-text text-xs text-gray-400">COMPLETED WORKS</h2>
        <div className="h-px flex-1 bg-gray-700" />
      </div>

      {/* Project cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {projects.map((project) => (
          <a
            key={project.name}
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative bg-gray-900 border-2 border-gray-700 hover:border-gray-500 rounded p-3 transition-all hover:-translate-y-1"
            style={{
              boxShadow: `0 4px 0 0 ${project.color}33`,
            }}
          >
            {/* Pixel icon */}
            <div
              className="w-full h-10 mb-2 flex items-center justify-center rounded-sm pixel-text text-[10px] font-bold text-white"
              style={{ background: project.color }}
            >
              {project.icon}
            </div>

            {/* Name */}
            <p className="pixel-text text-[9px] text-white mb-1 truncate">
              {project.name}
            </p>

            {/* Description */}
            <p className="text-[10px] text-gray-500 leading-tight">
              {project.description}
            </p>

            {/* Link indicator */}
            <div className="absolute top-1 right-1 text-gray-600 group-hover:text-gray-400 text-[8px] pixel-text">
              &gt;
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
